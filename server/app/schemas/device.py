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


class DeviceFrameRequest(BaseModel):
    """Trame brute « ; » (protocole §7.1) reçue par le webhook HTTP de secours."""
    frame: str = Field(..., min_length=1, max_length=512)
    key: str = Field(..., min_length=1, max_length=200)


class RelayFrameIn(BaseModel):
    frame: str = Field(..., min_length=1, max_length=512)


class RelayRequest(BaseModel):
    """Trames stockées par le téléphone puis relayées (store-and-forward)."""
    frames: List[RelayFrameIn] = Field(..., min_length=1, max_length=100)


class DeviceAckRequest(BaseModel):
    """Accusé signé du traceur (protocole §7.4)."""
    id: str = Field(..., min_length=1, max_length=64)
    cmd: str = Field(..., min_length=1, max_length=20)
    ok: bool
    detail: str = Field("", max_length=200)
    trackerId: str = Field(..., min_length=1, max_length=50)
    sig: str = Field(..., min_length=1, max_length=128)


class DeviceCommandRequest(BaseModel):
    code: str = Field(..., pattern=r"^(LOCALISER|MODE|REDEMARRER)$")
    valeur: Optional[str] = Field(None, max_length=32)
