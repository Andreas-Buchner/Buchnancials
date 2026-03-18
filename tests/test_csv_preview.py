from app.services.csv_preview import preview_csv


def test_preview_detects_semicolon_and_headers():
    raw = (
        "Buchungstag;Betrag;Verwendungszweck\n"
        "01.03.2026;123,45;Salary\n"
        "02.03.2026;-10,50;Food\n"
    ).encode("utf-8")
    result = preview_csv(raw)
    assert result["delimiter"] == ";"
    assert result["row_count"] == 2
    assert "Buchungstag" in result["headers"]
    assert result["mapping_suggestions"]["description"] == "Verwendungszweck"


def test_preview_handles_cp1252():
    raw = (
        "Datum;Betrag;Text\n"
        "03.03.2026;-20,00;Miete f\xfcr M\xe4rz\n"
    ).encode("cp1252")
    result = preview_csv(raw)
    assert result["row_count"] == 1
    assert result["sample_rows"][0]["Text"] == "Miete für März"

