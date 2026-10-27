#!/usr/bin/env python3
"""Small local-network household finance dashboard; uses only the Python standard library."""

import argparse
import json
import math
import re
import sqlite3
from contextlib import contextmanager
from datetime import date
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent
DATABASE = ROOT / "data" / "household.sqlite3"
MAX_BODY_SIZE = 32_768


def connect_database():
    DATABASE.parent.mkdir(exist_ok=True)
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    connection.execute(
        """CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY,
            type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
            description TEXT NOT NULL,
            amount REAL NOT NULL CHECK(amount > 0),
            category TEXT NOT NULL,
            date TEXT NOT NULL
        )"""
    )
    connection.execute(
        """CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value REAL NOT NULL
        )"""
    )
    connection.execute(
        """CREATE TABLE IF NOT EXISTS extra_work (
            id INTEGER PRIMARY KEY,
            description TEXT NOT NULL,
            date TEXT NOT NULL,
            hours REAL NOT NULL CHECK(hours >= 0),
            received REAL NOT NULL CHECK(received >= 0),
            benefit REAL NOT NULL CHECK(benefit >= 0),
            cost REAL NOT NULL CHECK(cost >= 0),
            income_transaction_id INTEGER,
            benefit_transaction_id INTEGER,
            cost_transaction_id INTEGER
        )"""
    )
    transaction_columns = {
        row["name"] for row in connection.execute("PRAGMA table_info(transactions)").fetchall()
    }
    if "distance_km" not in transaction_columns:
        connection.execute("ALTER TABLE transactions ADD COLUMN distance_km REAL NOT NULL DEFAULT 0")
    connection.execute(
        """CREATE TABLE IF NOT EXISTS monthly_vehicle_costs (
            month TEXT PRIMARY KEY,
            amount REAL NOT NULL CHECK(amount > 0),
            transaction_id INTEGER NOT NULL UNIQUE,
            FOREIGN KEY(transaction_id) REFERENCES transactions(id)
        )"""
    )
    connection.commit()
    return connection


@contextmanager
def database():
    connection = connect_database()
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def parse_amount(value):
    if isinstance(value, bool):
        raise ValueError("Informe um valor válido.")
    if isinstance(value, (int, float)):
        return float(value)
    if not isinstance(value, str):
        raise ValueError("Informe um valor válido.")
    normalized = value.strip().replace("R$", "").replace(" ", "")
    if "," in normalized:
        if not re.fullmatch(r"\d+(?:\.\d{3})*,\d{1,2}", normalized):
            raise ValueError("Use o formato brasileiro, por exemplo 1.234,56.")
        normalized = normalized.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"\d{1,3}(?:\.\d{3})+", normalized):
        normalized = normalized.replace(".", "")
    try:
        return float(normalized)
    except ValueError:
        raise ValueError("Informe um valor válido.")


def validate_transaction(data):
    if not isinstance(data, dict):
        raise ValueError("Envie os dados do lançamento.")
    entry_type = data.get("type")
    description = data.get("description")
    category = data.get("category")
    transaction_date = data.get("date")
    amount = parse_amount(data.get("amount"))
    distance_km = parse_amount(data.get("distance_km") or 0)
    if entry_type not in ("income", "expense"):
        raise ValueError("Escolha entrada ou despesa.")
    if not isinstance(description, str) or not description.strip() or len(description.strip()) > 120:
        raise ValueError("A descrição deve ter entre 1 e 120 caracteres.")
    if not isinstance(category, str) or not category.strip() or len(category.strip()) > 50:
        raise ValueError("Informe uma categoria de até 50 caracteres.")
    if not math.isfinite(amount) or amount <= 0 or amount > 1_000_000_000:
        raise ValueError("O valor deve ser maior que zero e menor que R$ 1 bilhão.")
    if not math.isfinite(distance_km) or distance_km < 0 or distance_km > 10000:
        raise ValueError("A quilometragem deve ficar entre 0 e 10.000 km.")
    if distance_km and (entry_type != "income" or category.strip().upper() != "UBER"):
        raise ValueError("A quilometragem só pode ser informada em ganhos da categoria UBER.")
    if not isinstance(transaction_date, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", transaction_date):
        raise ValueError("Informe uma data válida.")
    try:
        date.fromisoformat(transaction_date)
    except ValueError:
        raise ValueError("Informe uma data válida.")
    return entry_type, description.strip(), amount, category.strip(), transaction_date, distance_km


def validate_uber_settings(data):
    if not isinstance(data, dict):
        raise ValueError("Envie as configurações de custos do Uber.")
    settings = {}
    for name in (
        "fuel_price_per_liter",
        "fuel_efficiency_km_per_liter",
        "vehicle_cost_per_km",
        "target_margin_percent",
        "weekday_hourly_rate",
        "weekend_hourly_rate",
    ):
        raw_value = data.get(name)
        if raw_value is None or raw_value == "":
            settings[name] = None
            continue
        try:
            value = parse_amount(raw_value)
        except ValueError:
            raise ValueError("Informe custos e percentual válidos.")
        limit = {
            "target_margin_percent": 100,
            "fuel_price_per_liter": 1000,
            "fuel_efficiency_km_per_liter": 100,
            "vehicle_cost_per_km": 10000,
            "weekday_hourly_rate": 10000,
            "weekend_hourly_rate": 10000,
        }[name]
        minimum = 0 if name != "fuel_efficiency_km_per_liter" else 0.000001
        if not math.isfinite(value) or value < minimum or value > limit:
            if name == "fuel_efficiency_km_per_liter":
                raise ValueError("O consumo médio deve ser maior que zero e menor ou igual a 100 km/L.")
            raise ValueError("Confira os custos, as taxas horárias e a meta de margem informados.")
        settings[name] = value
    return settings


def validate_monthly_vehicle_cost(data):
    if not isinstance(data, dict):
        raise ValueError("Envie o valor da manutenção mensal.")
    try:
        amount = parse_amount(data.get("amount", 0))
    except ValueError:
        raise ValueError("Informe um valor válido para a manutenção mensal.")
    if not math.isfinite(amount) or amount < 0 or amount > 1_000_000_000:
        raise ValueError("A manutenção mensal deve ficar entre R$ 0 e R$ 1 bilhão.")
    return amount


def validate_extra_work(data):
    if not isinstance(data, dict):
        raise ValueError("Envie os dados do serviço extra.")
    description = data.get("description")
    transaction_date = data.get("date")
    if not isinstance(description, str) or not description.strip() or len(description.strip()) > 120:
        raise ValueError("A descrição deve ter entre 1 e 120 caracteres.")
    if not isinstance(transaction_date, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", transaction_date):
        raise ValueError("Informe uma data válida.")
    try:
        date.fromisoformat(transaction_date)
    except ValueError:
        raise ValueError("Informe uma data válida.")
    try:
        hours = parse_amount(data.get("hours"))
        received = parse_amount(data.get("received"))
        benefit = parse_amount(data.get("benefit") or 0)
        cost = parse_amount(data.get("cost") or 0)
    except ValueError:
        raise ValueError("Use valores válidos, por exemplo 2,5 horas ou R$ 1.234,56.")
    if not math.isfinite(hours) or not 0 <= hours <= 168:
        raise ValueError("As horas do serviço devem ficar entre 0 e 168.")
    if any(not math.isfinite(value) or value < 0 or value > 1_000_000_000 for value in (received, benefit, cost)):
        raise ValueError("Recebido, benefício e custo devem ser positivos e menores que R$ 1 bilhão.")
    return {
        "description": description.strip(),
        "date": transaction_date,
        "hours": hours,
        "received": received,
        "benefit": benefit,
        "cost": cost,
    }


def validate_settings(data):
    if not isinstance(data, dict):
        raise ValueError("Envie os dados da jornada.")
    settings = {}
    for name in ("worked_hours", "required_hours", "monthly_goal"):
        try:
            value = float(data.get(name, 0))
        except (TypeError, ValueError):
            raise ValueError("Informe valores numéricos válidos.")
        limit = 168 if name != "monthly_goal" else 1_000_000_000
        if not math.isfinite(value) or value < 0 or value > limit:
            raise ValueError("As horas devem ficar entre 0 e 168; a meta deve ser positiva.")
        settings[name] = value
    return settings


class DashboardHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, format_string, *args):
        print("%s - %s" % (self.address_string(), format_string % args))

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise ValueError("Tamanho da requisição inválido.")
        if length <= 0 or length > MAX_BODY_SIZE:
            raise ValueError("A requisição está vazia ou é grande demais.")
        try:
            return json.loads(self.rfile.read(length))
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise ValueError("O conteúdo enviado não é um JSON válido.")

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/transactions":
            with database() as connection:
                rows = connection.execute(
                    """SELECT t.id, t.type, t.description, t.amount, t.category, t.date, t.distance_km,
                              EXISTS (
                                  SELECT 1 FROM extra_work e
                                  WHERE t.id IN (e.income_transaction_id, e.benefit_transaction_id, e.cost_transaction_id)
                              ) AS managed_by_extra,
                              EXISTS (
                                  SELECT 1 FROM monthly_vehicle_costs v
                                  WHERE v.transaction_id = t.id
                              ) AS managed_by_vehicle_cost
                       FROM transactions t ORDER BY t.date DESC, t.id DESC"""
                ).fetchall()
            return self.send_json(200, [dict(row) for row in rows])
        if path == "/api/extra-work":
            with database() as connection:
                rows = connection.execute(
                    """SELECT id, description, date, hours, received, benefit, cost
                       FROM extra_work ORDER BY date DESC, id DESC"""
                ).fetchall()
            return self.send_json(200, [dict(row) for row in rows])
        if path == "/api/uber-settings":
            with database() as connection:
                rows = connection.execute(
                    """SELECT key, value FROM settings
                       WHERE key IN (
                           'fuel_price_per_liter', 'fuel_efficiency_km_per_liter',
                           'vehicle_cost_per_km', 'target_margin_percent',
                           'weekday_hourly_rate', 'weekend_hourly_rate'
                       )"""
                ).fetchall()
            settings = {
                "fuel_price_per_liter": None,
                "fuel_efficiency_km_per_liter": None,
                "vehicle_cost_per_km": None,
                "target_margin_percent": None,
                "weekday_hourly_rate": None,
                "weekend_hourly_rate": None,
            }
            settings.update({row["key"]: row["value"] for row in rows})
            return self.send_json(200, settings)
        if path == "/api/vehicle-costs":
            with database() as connection:
                rows = connection.execute(
                    "SELECT month, amount FROM monthly_vehicle_costs ORDER BY month DESC"
                ).fetchall()
            return self.send_json(200, [dict(row) for row in rows])
        if path == "/api/settings":
            with database() as connection:
                rows = connection.execute("SELECT key, value FROM settings").fetchall()
            settings = {"worked_hours": 0, "required_hours": 0, "monthly_goal": 0}
            settings.update({row["key"]: row["value"] for row in rows})
            return self.send_json(200, settings)
        if path.startswith("/api/"):
            return self.send_json(404, {"error": "Recurso não encontrado."})
        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/extra-work":
            return self.create_extra_work()
        if path.startswith("/api/vehicle-costs/"):
            return self.update_vehicle_cost(path.rsplit("/", 1)[-1])
        if path != "/api/transactions":
            return self.send_json(404, {"error": "Recurso não encontrado."})
        try:
            transaction = validate_transaction(self.read_json())
        except ValueError as error:
            return self.send_json(400, {"error": str(error)})
        with database() as connection:
            cursor = connection.execute(
            """INSERT INTO transactions (type, description, amount, category, date, distance_km)
               VALUES (?, ?, ?, ?, ?, ?)""",
            transaction,
            )
            transaction_id = cursor.lastrowid
        return self.send_json(201, {"id": transaction_id})

    def update_vehicle_cost(self, month):
        if not re.fullmatch(r"\d{4}-\d{2}", month):
            return self.send_json(400, {"error": "Informe o mês no formato AAAA-MM."})
        try:
            date.fromisoformat(f"{month}-01")
            amount = validate_monthly_vehicle_cost(self.read_json())
        except ValueError as error:
            return self.send_json(400, {"error": str(error)})
        with database() as connection:
            existing = connection.execute(
                "SELECT transaction_id FROM monthly_vehicle_costs WHERE month = ?", (month,)
            ).fetchone()
            if amount == 0:
                if existing:
                    connection.execute("DELETE FROM transactions WHERE id = ?", (existing["transaction_id"],))
                    connection.execute("DELETE FROM monthly_vehicle_costs WHERE month = ?", (month,))
                return self.send_json(200, {"month": month, "amount": 0})
            transaction_date = f"{month}-01"
            if existing:
                connection.execute(
                    """UPDATE transactions SET amount = ?, date = ?
                       WHERE id = ?""",
                    (amount, transaction_date, existing["transaction_id"]),
                )
                transaction_id = existing["transaction_id"]
            else:
                cursor = connection.execute(
                    """INSERT INTO transactions (type, description, amount, category, date, distance_km)
                       VALUES ('expense', 'Manutenção mensal do carro', ?, 'Manutenção do carro', ?, 0)""",
                    (amount, transaction_date),
                )
                transaction_id = cursor.lastrowid
                connection.execute(
                    "INSERT INTO monthly_vehicle_costs (month, amount, transaction_id) VALUES (?, ?, ?)",
                    (month, amount, transaction_id),
                )
            connection.execute(
                "UPDATE monthly_vehicle_costs SET amount = ? WHERE month = ?", (amount, month)
            )
        return self.send_json(200, {"month": month, "amount": amount})

    def create_extra_work(self):
        try:
            service = validate_extra_work(self.read_json())
        except ValueError as error:
            return self.send_json(400, {"error": str(error)})
        with database() as connection:
            transaction_ids = {"income_transaction_id": None, "benefit_transaction_id": None, "cost_transaction_id": None}
            entries = (
                ("received", "income_transaction_id", "income", f"Extra: {service['description']}", "EXTRAS"),
                ("benefit", "benefit_transaction_id", "income", f"Benefício extra: {service['description']}", "EXTRAS"),
                ("cost", "cost_transaction_id", "expense", f"Custo de trabalho: {service['description']}", "Trabalho extra"),
            )
            for value_key, id_key, entry_type, description, category in entries:
                value = service[value_key]
                if value > 0:
                    cursor = connection.execute(
                        """INSERT INTO transactions (type, description, amount, category, date)
                           VALUES (?, ?, ?, ?, ?)""",
                        (entry_type, description, value, category, service["date"]),
                    )
                    transaction_ids[id_key] = cursor.lastrowid
            cursor = connection.execute(
                """INSERT INTO extra_work (
                       description, date, hours, received, benefit, cost,
                       income_transaction_id, benefit_transaction_id, cost_transaction_id
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    service["description"], service["date"], service["hours"], service["received"],
                    service["benefit"], service["cost"], transaction_ids["income_transaction_id"],
                    transaction_ids["benefit_transaction_id"], transaction_ids["cost_transaction_id"],
                ),
            )
            service_id = cursor.lastrowid
        return self.send_json(201, {"id": service_id})

    def do_PUT(self):
        path = urlparse(self.path).path
        if path == "/api/uber-settings":
            return self.update_uber_settings()
        if path != "/api/settings":
            return self.send_json(404, {"error": "Recurso não encontrado."})
        try:
            settings = validate_settings(self.read_json())
        except ValueError as error:
            return self.send_json(400, {"error": str(error)})
        with database() as connection:
            connection.executemany(
                "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                settings.items(),
            )
        return self.send_json(200, settings)

    def update_uber_settings(self):
        try:
            settings = validate_uber_settings(self.read_json())
        except ValueError as error:
            return self.send_json(400, {"error": str(error)})
        with database() as connection:
            for name, value in settings.items():
                if value is None:
                    connection.execute("DELETE FROM settings WHERE key = ?", (name,))
                else:
                    connection.execute(
                        """INSERT INTO settings (key, value) VALUES (?, ?)
                           ON CONFLICT(key) DO UPDATE SET value = excluded.value""",
                        (name, value),
                    )
        return self.send_json(200, settings)

    def do_DELETE(self):
        extra_work_match = re.fullmatch(r"/api/extra-work/(\d+)", unquote(urlparse(self.path).path))
        if extra_work_match:
            service_id = int(extra_work_match.group(1))
            with database() as connection:
                service = connection.execute(
                    """SELECT income_transaction_id, benefit_transaction_id, cost_transaction_id
                       FROM extra_work WHERE id = ?""",
                    (service_id,),
                ).fetchone()
                if service is None:
                    return self.send_json(404, {"error": "Serviço extra não encontrado."})
                connection.execute(
                    """DELETE FROM transactions WHERE id IN (?, ?, ?)""",
                    (service["income_transaction_id"], service["benefit_transaction_id"], service["cost_transaction_id"]),
                )
                connection.execute("DELETE FROM extra_work WHERE id = ?", (service_id,))
            self.send_response(204)
            self.end_headers()
            return
        match = re.fullmatch(r"/api/transactions/(\d+)", unquote(urlparse(self.path).path))
        if not match:
            return self.send_json(404, {"error": "Recurso não encontrado."})
        with database() as connection:
            transaction_id = int(match.group(1))
            managed = connection.execute(
                """SELECT 1 FROM extra_work
                   WHERE ? IN (income_transaction_id, benefit_transaction_id, cost_transaction_id)""",
                (transaction_id,),
            ).fetchone()
            if managed:
                return self.send_json(409, {"error": "Este lançamento pertence a um serviço extra. Exclua o serviço na aba Meus trabalhos."})
            managed_vehicle_cost = connection.execute(
                "SELECT month FROM monthly_vehicle_costs WHERE transaction_id = ?", (transaction_id,)
            ).fetchone()
            if managed_vehicle_cost:
                return self.send_json(409, {"error": "Esta despesa é a manutenção mensal do carro. Ajuste o valor na aba Meus trabalhos."})
            cursor = connection.execute("DELETE FROM transactions WHERE id = ?", (transaction_id,))
        if cursor.rowcount == 0:
            return self.send_json(404, {"error": "Lançamento não encontrado."})
        self.send_response(204)
        self.end_headers()

    def do_PATCH(self):
        match = re.fullmatch(r"/api/transactions/(\d+)/distance", unquote(urlparse(self.path).path))
        if not match:
            return self.send_json(404, {"error": "Recurso não encontrado."})
        try:
            data = self.read_json()
            distance_km = parse_amount(data.get("distance_km")) if isinstance(data, dict) else math.nan
        except ValueError as error:
            return self.send_json(400, {"error": str(error)})
        if not math.isfinite(distance_km) or distance_km <= 0 or distance_km > 10000:
            return self.send_json(400, {"error": "Informe uma quilometragem maior que zero e até 10.000 km."})
        with database() as connection:
            cursor = connection.execute(
                """UPDATE transactions SET distance_km = ?
                   WHERE id = ? AND type = 'income' AND UPPER(category) = 'UBER'""",
                (distance_km, int(match.group(1))),
            )
        if cursor.rowcount == 0:
            return self.send_json(404, {"error": "Ganho UBER não encontrado."})
        return self.send_json(200, {"id": int(match.group(1)), "distance_km": distance_km})

    def translate_path(self, path):
        requested = super().translate_path(path)
        resolved = Path(requested).resolve()
        if resolved != ROOT and ROOT not in resolved.parents:
            return str(ROOT / "__not_found__")
        return str(resolved)


def main():
    parser = argparse.ArgumentParser(description="Inicia o dashboard financeiro da família.")
    parser.add_argument("--host", default="127.0.0.1", help="Endereço de escuta (padrão: somente este computador)")
    parser.add_argument("--port", type=int, default=8765, help="Porta HTTP (padrão: 8765)")
    args = parser.parse_args()
    connect_database().close()
    server = ThreadingHTTPServer((args.host, args.port), DashboardHandler)
    print(f"Dashboard disponível em http://127.0.0.1:{args.port}")
    if args.host == "0.0.0.0":
        print("Para outros dispositivos da rede, use o endereço IP local deste computador.")
    print("Pressione Ctrl+C para encerrar.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor encerrado.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
