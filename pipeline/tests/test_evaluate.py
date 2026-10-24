import numpy as np
import pandas as pd

from lunop.modeling import evaluate


def test_deviance_is_zero_for_perfect_forecast():
    assert evaluate.deviance([0, 3, 10], [1e-12, 3, 10]) < 1e-9
    assert evaluate.deviance([0, 3], [1, 1]) > 0


def test_confusion_counts_hits_and_false_alarms():
    level = pd.Series(["High", "Normal", "Elevated", "Severe", "High"])
    surge = pd.Series([True, True, False, False, np.nan])  # the last week is unobserved
    c = evaluate.confusion(level, surge)
    assert c["surges"] == 2
    assert c["hit_rate_high"] == 0.5 and c["false_alarm_high"] == 0.5
    assert c["hit_rate_elevated"] == 0.5 and c["false_alarm_elevated"] == 0.667


def test_pick_replay_skips_events_from_the_same_storm():
    row = lambda d, level, surge, ratio: {"event_id": d, "date": d, "level": {"with_cases": level}, "surge": surge,
                                          "surge_ratio": ratio}
    rows = [row("2011-08-15", "Severe", True, 25), row("2011-08-22", "Severe", True, 24),
            row("2012-05-28", "High", True, 3), row("2009-07-27", "Normal", True, 3.3), row("2019-08-26", "Normal", False, 0.2)]
    assert evaluate.pick_replay(rows) == ["2011-08-15", "2012-05-28", "2009-07-27"]
