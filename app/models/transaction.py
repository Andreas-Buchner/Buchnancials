from pydantic import BaseModel, Field


class TransactionPatch(BaseModel):
    category_id: int | None = None
    excluded: bool | None = None
    memo: str | None = None


class TransactionBatchItem(TransactionPatch):
    id: int


class TransactionBatchPatch(BaseModel):
    updates: list[TransactionBatchItem] = Field(default_factory=list)


class TransactionSplitItem(BaseModel):
    category_id: int
    amount: float


class TransactionSplitUpdate(BaseModel):
    splits: list[TransactionSplitItem] = Field(default_factory=list)
