import copy
import logging
import sys
import time

import pytest

from app.ai import client as ai
from app.ai.scope import REFUSAL
from app.ai.validate import NO_SOURCE_NOTE, SAFE_FALLBACK
from app.config import get_settings

KEY = "test-secret-key-0042"


@pytest.fixture(autouse=True)
def _configured(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", KEY)
    monkeypatch.setenv("GEMINI_MODEL", "some-other-model")  # must be ignored: the model is fixed
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def result(client, case_body):
    return client.post("/api/analyze", json=case_body(2)).json()


class Fake:
    """Replaces the one function that would contact Gemini and records every call."""

    def __init__(self, answer="C3 is below the reference. One possibility is lower bone density.", exc=None, delay=0.0):
        self.calls, self.answer, self.exc, self.delay = [], answer, exc, delay

    def __call__(self, system, context_json, history, question, **kw):
        self.calls.append({"system": system, "context": context_json, "history": history, "question": question, **kw})
        if self.delay:
            time.sleep(self.delay)
        if self.exc:
            raise self.exc
        return self.answer


def post(client, result, question, history=None):
    return client.post("/api/ask-result", json={"question": question, "history": history or [], "result": result})


def test_t_8_2_01_in_scope_question(client, result, monkeypatch):
    fake = Fake()
    monkeypatch.setattr(ai, "ask", fake)
    r = post(client, result, "Why is L2 flagged?")
    body = r.json()
    assert r.status_code == 200 and body["ai_generated"] is True and "reference" in body["answer"]
    assert "AI-generated" in body["label"] and len(fake.calls) == 1
    assert fake.calls[0]["api_key"] == KEY and fake.calls[0]["model"] == "gemini-3.5-flash-lite"


def test_any_wording_goes_to_the_model(client, result, monkeypatch):
    fake = Fake()
    monkeypatch.setattr(ai, "ask", fake)
    for q in ("Write Python code to add two numbers", "What does this mean?", "is my back ok lol"):
        body = post(client, result, q).json()
        assert body["ai_generated"] is True and body["refused"] is False
    assert len(fake.calls) == 3


def test_t_8_2_04_no_key(client, result, monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "")
    get_settings.cache_clear()
    fake = Fake()
    monkeypatch.setattr(ai, "ask", fake)
    r = post(client, result, "Why is C3 flagged?")
    assert r.status_code == 503 and r.json()["error"]["code"] == "ai_not_configured" and fake.calls == []


def test_t_8_2_05_quota_is_not_retried(client, result, monkeypatch):
    fake = Fake(exc=ai.AiQuota("quota"))
    monkeypatch.setattr(ai, "ask", fake)
    r = post(client, result, "Why is C3 flagged?")
    assert r.status_code == 503 and r.json()["error"]["code"] == "ai_quota" and len(fake.calls) == 1


def test_t_8_2_06_timeout(client, result, monkeypatch):
    monkeypatch.setattr(ai, "ASK_TIMEOUT_SECONDS", 0.3)
    monkeypatch.setattr(ai, "ask", Fake(delay=1.5))
    start = time.perf_counter()
    r = post(client, result, "Why is C3 flagged?")
    assert r.status_code == 504 and r.json()["error"]["code"] == "ai_timeout"
    assert time.perf_counter() - start < 1.2


def test_other_failures_are_a_controlled_502(client, result, monkeypatch):
    monkeypatch.setattr(ai, "ask", Fake(exc=ai.AiError("boom")))
    r = post(client, result, "Why is C3 flagged?")
    assert r.status_code == 502 and r.json()["error"]["code"] == "ai_error" and "boom" not in r.text


def test_t_8_2_07_invented_citation_is_removed(client, result, monkeypatch):
    monkeypatch.setattr(ai, "ask", Fake(answer="See doi 10.1234/fake.2020 and https://example.org/x for more."))
    body = post(client, result, "What sources support this general explanation?").json()
    assert "10.1234" not in body["answer"] and "example.org" not in body["answer"] and NO_SOURCE_NOTE in body["answer"]


def test_t_8_2_08_diagnostic_wording_is_replaced(client, result, monkeypatch):
    monkeypatch.setattr(ai, "ask", Fake(answer="You have a fracture at C3."))
    assert post(client, result, "Why is C3 flagged?").json()["answer"] == SAFE_FALLBACK


def test_t_8_2_09_payload_has_no_identifier_and_stays_small(client, result, monkeypatch):
    fake = Fake()
    monkeypatch.setattr(ai, "ask", fake)
    dirty = copy.deepcopy(result)
    dirty["name"] = "Jane Roe"
    dirty["statistical"]["email"] = "jane@example.org"
    post(client, dirty, "Why is L2 flagged?")
    sent = fake.calls[0]
    blob = sent["context"] + sent["question"] + sent["system"]
    assert "Jane" not in blob and "jane@" not in blob and len(sent["context"].encode()) < 4500


def test_t_8_2_10_rate_limit(client, result, monkeypatch):
    monkeypatch.setattr(ai, "ask", Fake())
    codes = [post(client, result, "Why is C3 flagged?").status_code for _ in range(6)]
    assert codes[:5] == [200] * 5 and codes[5] == 429


def test_t_8_2_11_oversized_question(client, result):
    assert post(client, result, "C3 " * 2000).status_code in (413, 422)
    assert post(client, result, "x" * 501).status_code == 422
    assert client.post("/api/ask-result", json={"question": "Why is C3 flagged?", "result": result, "history": [{"role": "user", "text": "a"}] * 7}).status_code == 422


def test_t_8_2_12_analyze_is_independent_of_the_assistant(client, case_body, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("assistant down")

    monkeypatch.setattr(ai, "ask", boom)
    monkeypatch.setenv("GEMINI_API_KEY", "")
    get_settings.cache_clear()
    r = client.post("/api/analyze", json=case_body(2))
    assert r.status_code == 200 and r.json()["overall"]["state"] == "unusual_pattern"


def test_t_8_2_13_the_key_never_appears_in_responses_or_logs(client, result, monkeypatch, caplog):
    texts = []
    with caplog.at_level(logging.DEBUG):
        for fake in (Fake(), Fake(exc=ai.AiQuota("q")), Fake(exc=ai.AiError("e")), Fake(exc=ai.AiTimeout("t"))):
            monkeypatch.setattr(ai, "ask", fake)
            texts.append(post(client, result, "Why is C3 flagged?").text)
        texts.append(client.get("/api/health").text)
        texts.append(client.get("/openapi.json").text)
    assert KEY not in "\n".join(texts) and KEY not in "\n".join(r.getMessage() for r in caplog.records)


def test_history_is_passed_through_but_limited(client, result, monkeypatch):
    fake = Fake()
    monkeypatch.setattr(ai, "ask", fake)
    post(client, result, "And why C4?", history=[{"role": "user", "text": "Why is C3 flagged?"}, {"role": "assistant", "text": "Because."}])
    assert [t["role"] for t in fake.calls[0]["history"]] == ["user", "assistant"]


def test_the_google_library_is_not_loaded_by_the_mocked_path(client, result, monkeypatch):
    monkeypatch.setattr(ai, "ask", Fake())
    post(client, result, "Why is C3 flagged?")
    assert "google.genai" not in sys.modules
