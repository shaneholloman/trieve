# DateRange

DateRange is a JSON object which can be used to filter chunks by a range of dates. This leverages the time_stamp field on chunks in your dataset. You can specify this if you want values in a certain range. You must provide ISO 8601 combined date and time without timezone.

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**gt** | **str** |  | [optional] 
**gte** | **str** |  | [optional] 
**lt** | **str** |  | [optional] 
**lte** | **str** |  | [optional] 

## Example

```python
from trieve_py_client.models.date_range import DateRange

# TODO update the JSON string below
json = "{}"
# create an instance of DateRange from a JSON string
date_range_instance = DateRange.from_json(json)
# print the JSON string representation of the object
print(DateRange.to_json())

# convert the object into a dict
date_range_dict = date_range_instance.to_dict()
# create an instance of DateRange from a dict
date_range_form_dict = date_range.from_dict(date_range_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


