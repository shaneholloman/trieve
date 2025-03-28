# coding: utf-8

"""
    Trieve API

    Trieve OpenAPI Specification. This document describes all of the operations available through the Trieve API.

    The version of the OpenAPI document: 0.13.0
    Contact: developers@trieve.ai
    Generated by OpenAPI Generator (https://openapi-generator.tech)

    Do not edit the class manually.
"""  # noqa: E501


from __future__ import annotations
import pprint
import re  # noqa: F401
import json

from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr
from typing import Any, ClassVar, Dict, List, Optional
from trieve_py_client.models.api_key_request_params import ApiKeyRequestParams
from typing import Optional, Set
from typing_extensions import Self

class CreateApiKeyReqPayload(BaseModel):
    """
    CreateApiKeyReqPayload
    """ # noqa: E501
    dataset_ids: Optional[List[StrictStr]] = Field(default=None, description="The dataset ids which the api key will have access to. If not provided or empty, the api key will have access to all datasets in the dataset.")
    default_params: Optional[ApiKeyRequestParams] = None
    expires_at: Optional[StrictStr] = Field(default=None, description="The expiration date of the api key. If not provided, the api key will not expire. This should be provided in UTC time.")
    name: StrictStr = Field(description="The name which will be assigned to the new api key.")
    role: StrictInt = Field(description="The role which will be assigned to the new api key. Either 0 (read), 1 (Admin) or 2 (Owner). The auth'ed user must have a role greater than or equal to the role being assigned.")
    scopes: Optional[List[StrictStr]] = Field(default=None, description="The routes which the api key will have access to. If not provided or empty, the api key will have access to all routes. Specify the routes as a list of strings. For example, [\"GET /api/dataset\", \"POST /api/dataset\"].")
    __properties: ClassVar[List[str]] = ["dataset_ids", "default_params", "expires_at", "name", "role", "scopes"]

    model_config = ConfigDict(
        populate_by_name=True,
        validate_assignment=True,
        protected_namespaces=(),
    )


    def to_str(self) -> str:
        """Returns the string representation of the model using alias"""
        return pprint.pformat(self.model_dump(by_alias=True))

    def to_json(self) -> str:
        """Returns the JSON representation of the model using alias"""
        # TODO: pydantic v2: use .model_dump_json(by_alias=True, exclude_unset=True) instead
        return json.dumps(self.to_dict())

    @classmethod
    def from_json(cls, json_str: str) -> Optional[Self]:
        """Create an instance of CreateApiKeyReqPayload from a JSON string"""
        return cls.from_dict(json.loads(json_str))

    def to_dict(self) -> Dict[str, Any]:
        """Return the dictionary representation of the model using alias.

        This has the following differences from calling pydantic's
        `self.model_dump(by_alias=True)`:

        * `None` is only added to the output dict for nullable fields that
          were set at model initialization. Other fields with value `None`
          are ignored.
        """
        excluded_fields: Set[str] = set([
        ])

        _dict = self.model_dump(
            by_alias=True,
            exclude=excluded_fields,
            exclude_none=True,
        )
        # override the default output from pydantic by calling `to_dict()` of default_params
        if self.default_params:
            _dict['default_params'] = self.default_params.to_dict()
        # set to None if dataset_ids (nullable) is None
        # and model_fields_set contains the field
        if self.dataset_ids is None and "dataset_ids" in self.model_fields_set:
            _dict['dataset_ids'] = None

        # set to None if default_params (nullable) is None
        # and model_fields_set contains the field
        if self.default_params is None and "default_params" in self.model_fields_set:
            _dict['default_params'] = None

        # set to None if expires_at (nullable) is None
        # and model_fields_set contains the field
        if self.expires_at is None and "expires_at" in self.model_fields_set:
            _dict['expires_at'] = None

        # set to None if scopes (nullable) is None
        # and model_fields_set contains the field
        if self.scopes is None and "scopes" in self.model_fields_set:
            _dict['scopes'] = None

        return _dict

    @classmethod
    def from_dict(cls, obj: Optional[Dict[str, Any]]) -> Optional[Self]:
        """Create an instance of CreateApiKeyReqPayload from a dict"""
        if obj is None:
            return None

        if not isinstance(obj, dict):
            return cls.model_validate(obj)

        _obj = cls.model_validate({
            "dataset_ids": obj.get("dataset_ids"),
            "default_params": ApiKeyRequestParams.from_dict(obj["default_params"]) if obj.get("default_params") is not None else None,
            "expires_at": obj.get("expires_at"),
            "name": obj.get("name"),
            "role": obj.get("role"),
            "scopes": obj.get("scopes")
        })
        return _obj


