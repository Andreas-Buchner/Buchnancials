from pydantic import BaseModel


class ImportSummary(BaseModel):
    import_job_id: int
    filename: str
    row_count: int
    imported_new: int
    ignored_duplicates: int
    failed_rows: int
    failures: list[dict]

