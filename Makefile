.PHONY: setup data train evaluate replay live test all

PY = cd pipeline && uv run python -m

setup:
	cd pipeline && uv sync

data:
	$(PY) lunop.dataset

train:
	$(PY) lunop.rain_check
	$(PY) lunop.modeling.train

evaluate:
	$(PY) lunop.modeling.evaluate

replay:
	$(PY) lunop.replay

live:
	$(PY) lunop.modeling.predict

test:
	cd pipeline && uv run pytest

all: setup data train evaluate replay
