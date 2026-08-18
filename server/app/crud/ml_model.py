from app.crud.base import CRUDBase
from app.models.ml_model import MarkovModel, FamiliarCell, HourlyProfile

crud_markov = CRUDBase(MarkovModel)
crud_familiar_cell = CRUDBase(FamiliarCell)
crud_hourly_profile = CRUDBase(HourlyProfile)
