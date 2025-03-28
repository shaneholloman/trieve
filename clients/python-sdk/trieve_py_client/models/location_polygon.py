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

from pydantic import BaseModel, ConfigDict
from typing import Any, ClassVar, Dict, List, Optional
from trieve_py_client.models.geo_info import GeoInfo
from typing import Optional, Set
from typing_extensions import Self

class LocationPolygon(BaseModel):
    """
    LocationPolygon
    """ # noqa: E501
    exterior: List[GeoInfo]
    interior: Optional[List[List[GeoInfo]]] = None
    __properties: ClassVar[List[str]] = ["exterior", "interior"]

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
        """Create an instance of LocationPolygon from a JSON string"""
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
        # override the default output from pydantic by calling `to_dict()` of each item in exterior (list)
        _items = []
        if self.exterior:
            for _item in self.exterior:
                if _item:
                    _items.append(_item.to_dict())
            _dict['exterior'] = _items
        # override the default output from pydantic by calling `to_dict()` of each item in interior (list of list)
        _items = []
        if self.interior:
            for _item in self.interior:
                if _item:
                    _items.append(
                         [_inner_item.to_dict() for _inner_item in _item if _inner_item is not None]
                    )
            _dict['interior'] = _items
        # set to None if interior (nullable) is None
        # and model_fields_set contains the field
        if self.interior is None and "interior" in self.model_fields_set:
            _dict['interior'] = None

        return _dict

    @classmethod
    def from_dict(cls, obj: Optional[Dict[str, Any]]) -> Optional[Self]:
        """Create an instance of LocationPolygon from a dict"""
        if obj is None:
            return None

        if not isinstance(obj, dict):
            return cls.model_validate(obj)

        _obj = cls.model_validate({
            "exterior": [GeoInfo.from_dict(_item) for _item in obj["exterior"]] if obj.get("exterior") is not None else None,
            "interior": [
                    [GeoInfo.from_dict(_inner_item) for _inner_item in _item]
                    for _item in obj["interior"]
                ] if obj.get("interior") is not None else None
        })
        return _obj


