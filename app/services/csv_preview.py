import csv
import io
from dataclasses import dataclass


@dataclass
class ParsedCsv:
    encoding: str
    delimiter: str
    headers: list[str]
    rows: list[dict[str, str]]


_FIELD_ALIASES: dict[str, list[str]] = {
    "booking_date": ["bookingdate", "booking_date", "buchungstag", "buchungsdatum", "date", "datum"],
    "amount": ["amount", "betrag", "value", "summe"],
    "description": ["verwendungszweck", "description", "text", "buchungstext", "paymentpurpose"],
    "counterparty_name": [
        "counterparty",
        "counterpartyname",
        "empfaenger",
        "auftraggeber",
        "auftraggebername",
        "payee",
        "recipient",
        "sender",
    ],
    "raw_text": ["rawtext", "buchungstext", "text", "bookingtext"],
}


def _normalize_header(name: str) -> str:
    return "".join(ch for ch in name.lower() if ch.isalnum())


def suggest_mapping(headers: list[str]) -> dict[str, str]:
    normalized_map = {_normalize_header(h): h for h in headers}
    mapping: dict[str, str] = {}
    for internal, aliases in _FIELD_ALIASES.items():
        for alias in aliases:
            if alias in normalized_map:
                mapping[internal] = normalized_map[alias]
                break
    return mapping


def decode_csv_bytes(raw_bytes: bytes) -> tuple[str, str]:
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return raw_bytes.decode(encoding), encoding
        except UnicodeDecodeError:
            continue
    raise ValueError("Unable to decode CSV file with supported encodings (utf-8/cp1252/latin-1).")


def detect_delimiter(text: str) -> str:
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=";,")
        return dialect.delimiter
    except csv.Error:
        semicolon_count = sample.count(";")
        comma_count = sample.count(",")
        return ";" if semicolon_count >= comma_count else ","


def parse_csv(raw_bytes: bytes) -> ParsedCsv:
    text, encoding = decode_csv_bytes(raw_bytes)
    delimiter = detect_delimiter(text)
    stream = io.StringIO(text, newline="")
    reader = csv.DictReader(stream, delimiter=delimiter)

    if reader.fieldnames is None:
        raise ValueError("CSV file has no header row.")

    headers = [h.strip() if h else "" for h in reader.fieldnames]
    reader.fieldnames = headers
    rows: list[dict[str, str]] = []
    for row in reader:
        normalized = {
            k.strip(): (v.strip() if isinstance(v, str) else "")
            for k, v in row.items()
            if k is not None
        }
        if not any(normalized.values()):
            continue
        rows.append(normalized)

    if not rows:
        raise ValueError("CSV has no transaction rows.")

    return ParsedCsv(encoding=encoding, delimiter=delimiter, headers=headers, rows=rows)


def preview_csv(raw_bytes: bytes, max_rows: int = 15) -> dict:
    parsed = parse_csv(raw_bytes)
    return {
        "encoding": parsed.encoding,
        "delimiter": parsed.delimiter,
        "headers": parsed.headers,
        "row_count": len(parsed.rows),
        "sample_rows": parsed.rows[:max_rows],
        "mapping_suggestions": suggest_mapping(parsed.headers),
    }
