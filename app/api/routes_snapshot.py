from datetime import datetime

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse

from app.core.config import get_settings
from app.services.snapshot import SnapshotError, import_snapshot_bytes

router = APIRouter(tags=["snapshot"])


@router.get("/snapshot/export")
def export_snapshot() -> FileResponse:
    db_path = get_settings().db_path
    if not db_path.exists():
        raise HTTPException(status_code=404, detail="Es wurde noch keine Datenbank gefunden.")

    filename = f"buchnancials-snapshot-{datetime.now().strftime('%Y%m%d-%H%M%S')}.db"
    return FileResponse(
        path=str(db_path),
        media_type="application/octet-stream",
        filename=filename,
    )


@router.post("/snapshot/import")
async def import_snapshot(file: UploadFile = File(...)) -> JSONResponse:
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Die Snapshot-Datei ist leer.")

    try:
        summary = import_snapshot_bytes(get_settings().db_path, payload)
    except SnapshotError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return JSONResponse(summary)
