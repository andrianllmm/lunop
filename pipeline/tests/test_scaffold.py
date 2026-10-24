import importlib

import pytest

MODULES = [
    "lunop.config",
    "lunop.dataset",
    "lunop.features",
    "lunop.rain_check",
    "lunop.replay",
    "lunop.modeling.train",
    "lunop.modeling.forecast",
    "lunop.modeling.evaluate",
    "lunop.modeling.predict",
]


@pytest.mark.parametrize("name", MODULES)
def test_imports(name):
    importlib.import_module(name)
