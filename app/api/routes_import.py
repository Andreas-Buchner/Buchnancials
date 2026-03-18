import json
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.core.db import get_connection
from app.services.csv_import import execute_import
from app.services.csv_preview import preview_csv

router = APIRouter(tags=["import"])


@router.post("/import/preview")
async def import_preview(file: UploadFile = File(...)) -> JSONResponse:
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    try:
        payload = preview_csv(raw, max_rows=get_settings().preview_row_limit)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return JSONResponse(payload)


@router.post("/import/execute")
async def import_execute(
    file: UploadFile = File(...),
    mapping_json: str = Form(...),
) -> JSONResponse:
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    try:
        mapping = json.loads(mapping_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid mapping_json.") from exc

    safe_filename = Path(file.filename or "uploaded.csv").name
    copy_target = get_settings().imports_dir / safe_filename
    with get_connection() as conn:
        try:
            summary = execute_import(
                conn=conn,
                filename=safe_filename,
                file_bytes=raw,
                mapping=mapping,
                store_copy_path=copy_target,
            )
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    return JSONResponse(summary)

