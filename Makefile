.PHONY: setup data train evaluate replay live web test all

PY = cd pipeline && uv run python -m

setup:
	cd pipeline && uv sync
	cd web && npm install

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

web:
	cd web && npm run dev

test:
	cd pipeline && uv run pytest
	cd web && npm test

all: setup data train evaluate replay
