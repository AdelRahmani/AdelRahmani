"""Génère un devis PDF fictif pour les tests d'import : python3 tests/fixtures/make_devis.py"""
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

out = Path(__file__).parent / "devis-exemple.pdf"
st = getSampleStyleSheet()
rows = [["Désignation", "Qté", "U", "P.U. HT", "TVA", "Total HT"],
        ["Lessivage et préparation des supports", "28,81", "m²", "6,45", "10 %", "185,82"],
        ["Peinture acrylique murs, 2 couches", "28,81", "m²", "19,24", "10 %", "554,30"],
        ["Dépose de parquet stratifié", "21,32", "m²", "7,80", "10 %", "166,30"],
        ["Fourniture et pose parquet stratifié", "21,32", "m²", "43,68", "10 %", "931,26"],
        ["Remplacement du bloc-porte de la cuisine", "1", "U", "1 250,00", "10 %", "1 250,00"],
        ["Déplacement et protection du chantier", "1", "forfait", "85,00", "20 %", "85,00"]]
t = Table(rows, colWidths=[230, 45, 40, 60, 45, 65])
t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.4, colors.grey), ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey), ("ALIGN", (1, 0), (-1, -1), "RIGHT"), ("FONTSIZE", (0, 0), (-1, -1), 9)]))
tot = Table([["Total HT", "3 172,68 €"], ["TVA", "325,77 €"], ["Total TTC", "3 498,45 €"]], colWidths=[80, 80], hAlign="RIGHT")
doc = SimpleDocTemplate(str(out), pagesize=A4, title="Devis exemple")
doc.build([Paragraph("RÉNO SERVICES SARL", st["Title"]), Paragraph("12 avenue de la République 69003 Lyon", st["Normal"]),
           Paragraph("SIRET 123 456 789 00012 - Tél : 04 00 00 00 00", st["Normal"]), Spacer(1, 14),
           Paragraph("DEVIS N° D-2026-0142 du 14/10/2026", st["Heading2"]), Paragraph("Client : Camille Exemple, 12 rue des Tilleuls 69003 Lyon", st["Normal"]),
           Spacer(1, 12), t, Spacer(1, 10), tot, Spacer(1, 16), Paragraph("Conditions de règlement : 30 % à la commande, solde à réception.", st["Normal"])])
print(out)
