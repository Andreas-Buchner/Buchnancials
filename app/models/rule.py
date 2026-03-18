from pydantic import BaseModel, Field


class RuleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    match_field: str
    match_type: str
    match_value: str = Field(min_length=1)
    second_match_field: str | None = None
    second_match_type: str | None = None
    second_match_value: str | None = Field(default=None, min_length=1)
    condition_operator: str = "and"
    counterparty_filter: str | None = None
    amount_sign: str = "any"
    category_id: int | None = None
    exclude_transaction: bool = False
    priority: int = 100
    active: bool = True


class RulePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    match_field: str | None = None
    match_type: str | None = None
    match_value: str | None = Field(default=None, min_length=1)
    second_match_field: str | None = None
    second_match_type: str | None = None
    second_match_value: str | None = Field(default=None, min_length=1)
    condition_operator: str | None = None
    counterparty_filter: str | None = None
    amount_sign: str | None = None
    category_id: int | None = None
    exclude_transaction: bool | None = None
    priority: int | None = None
    active: bool | None = None
