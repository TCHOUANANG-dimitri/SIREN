from pydantic import BaseModel, Field
from typing import Optional, List


class DeviceTelemetryPoint(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    speed: Optional[float] = None
    battery: Optional[int] = None
    accuracy: Optional[float] = None
    heading: Optional[float] = None
    imu: Optional[dict] = None
    ts: str


class DeviceTelemetryRequest(BaseModel):
    deviceId: str
    key: str
    batch: List[DeviceTelemetryPoint] = Field(..., min_length=1)


class DeviceTelemetryResponse(BaseModel):
    ack: bool
    configVersion: int


class DevicePackQuery(BaseModel):
    deviceId: str
    key: str
    have: Optional[int] = None


class DevicePackResponse(BaseModel):
    version: int
    payload: dict


class DeviceEventRequest(BaseModel):
    deviceId: str
    key: str
    type: str


class DeviceEventResponse(BaseModel):
    ack: bool


class DeviceSettingsResponse(BaseModel):
    energyMode: str
    sensitivity: str
    configVersion: int


class DeviceSettingsPatchRequest(BaseModel):
    energyMode: Optional[str] = None
    sensitivity: Optional[str] = None
