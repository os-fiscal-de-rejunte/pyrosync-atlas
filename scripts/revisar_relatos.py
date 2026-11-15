import argparse

from server.db import database, moderate_report
from server.secrets_store import load_credentials

load_credentials()
parser = argparse.ArgumentParser(description="Revisão local de relatos comunitários")
parser.add_argument("acao", choices=["listar", "aprovar", "rejeitar"])
parser.add_argument("id", nargs="?")
args = parser.parse_args()
if args.acao == "listar":
    with database() as conn:
        rows = conn.execute("SELECT id,country,region,observed_at,category,description FROM public.pyro_community_reports WHERE status='pendente' ORDER BY submitted_at DESC LIMIT 100").fetchall()
        for row in rows:
            print(row)
        print(f"Relatos pendentes exibidos: {len(rows)}")
elif not args.id:
    parser.error("Informe o identificador do relato.")
else:
    status = "aprovado" if args.acao == "aprovar" else "rejeitado"
    print("Relato atualizado." if moderate_report(args.id, status) else "Relato pendente não encontrado.")
