package ai

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func nilaiTokenUji(t *testing.T, v *int) int {
	t.Helper()
	if v == nil {
		t.Fatal("token aktual tidak boleh nil")
	}
	return *v
}

func TestNarrateRootCauseMengirimTokenDanMemparsingRespons(t *testing.T) {
	var gotToken, gotPath string
	var gotBody NarrateRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotToken = r.Header.Get("X-Service-Token")
		gotPath = r.URL.Path
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"batch_id": "FG-1013-07",
			"penyebab_utama": "SUMBER_RT04",
			"narasi": "Narasi uji.",
			"rekomendasi": ["Periksa RT-04"],
			"sumber": "jev",
			"label_data": "simulasi",
			"jev": {"pilihan": "SUMBER_RT04", "confidence": 0.9},
			"selisih_dengan_be": false,
			"llm_usage": {"prompt_tokens": 245, "completion_tokens": 1133, "reasoning_tokens": 1036}
		}`))
	}))
	defer srv.Close()

	c := New(srv.URL, "token-uji")
	if !c.Enabled() {
		t.Fatal("client dengan token harus Enabled")
	}
	resp, err := c.NarrateRootCause(context.Background(), NarrateRequest{
		BatchID:   "FG-1013-07",
		Komoditas: "susu",
		Konteks:   Context{QCStatus: "out-of-spec", KakiPerjalanan: []Leg{}, PelanggaranBatas: []Violation{}},
		Kandidat:  []Candidate{{Kode: "SUMBER_RT04", Skor: 0.78, Bukti: []string{"bukti"}}},
		LabelData: "simulasi",
	})
	if err != nil {
		t.Fatalf("NarrateRootCause error: %v", err)
	}
	if gotToken != "token-uji" {
		t.Errorf("header X-Service-Token = %q, mau %q", gotToken, "token-uji")
	}
	if gotPath != "/ai/root-cause/narrate" {
		t.Errorf("path = %q, mau /ai/root-cause/narrate", gotPath)
	}
	if gotBody.BatchID != "FG-1013-07" || len(gotBody.Kandidat) != 1 || gotBody.Kandidat[0].Kode != "SUMBER_RT04" {
		t.Errorf("body terkirim tidak sesuai: %+v", gotBody)
	}
	if resp.PenyebabUtama != "SUMBER_RT04" || resp.Sumber != "jev" || resp.SelisihDenganBE {
		t.Errorf("respons terparsing tidak sesuai: %+v", resp)
	}
	if resp.LLMUsage == nil || nilaiTokenUji(t, resp.LLMUsage.PromptTokens) != 245 ||
		nilaiTokenUji(t, resp.LLMUsage.CompletionTokens) != 1133 ||
		nilaiTokenUji(t, resp.LLMUsage.ReasoningTokens) != 1036 {
		t.Errorf("llm_usage tidak terparsing dengan benar: %+v", resp.LLMUsage)
	}
	var jev struct {
		Pilihan string `json:"pilihan"`
	}
	if err := json.Unmarshal(resp.Jev, &jev); err != nil || jev.Pilihan != "SUMBER_RT04" {
		t.Errorf("field jev mentah tidak utuh: %s", string(resp.Jev))
	}
}

func TestClientTanpaTokenNonaktif(t *testing.T) {
	c := New("", "")
	if c.Enabled() {
		t.Fatal("client tanpa token harus nonaktif")
	}
	if _, err := c.NarrateRootCause(context.Background(), NarrateRequest{}); err == nil {
		t.Fatal("panggilan tanpa token harus error, bukan diam-diam berhasil")
	}
	if c.baseURL != DefaultURL {
		t.Errorf("baseURL default = %q, mau %q", c.baseURL, DefaultURL)
	}
}

func TestNarrateRootCauseStatusBukan200(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()
	c := New(srv.URL, "token-uji")
	if _, err := c.NarrateRootCause(context.Background(), NarrateRequest{}); err == nil {
		t.Fatal("status 503 dari layanan AI harus menjadi error")
	}
}

func TestChooseRecommendationMengirimKandidatDanMemparsingPilihan(t *testing.T) {
	var gotBody RecommendationChoiceRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/ai/recommendation/choose" {
			t.Errorf("path = %s", r.URL.Path)
		}
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		_, _ = w.Write([]byte(`{"batch_id":"B1","pilihan":"naikkan_speed","sumber":"jev","label_data":"historis","jev":{"pilihan":"naikkan_speed","confidence":0.7},"selisih_dengan_be":true}`))
	}))
	defer srv.Close()

	c := New(srv.URL, "token-uji")
	resp, err := c.ChooseRecommendation(context.Background(), RecommendationChoiceRequest{
		BatchID: "B1", ProductionDate: "2026-11-01", LabelData: "historis",
		Fakta:    []string{"Kekurangan 30000 L"},
		Kandidat: []RecommendationCandidate{{Kode: "geser_jadwal", Deskripsi: "Geser jadwal", SkorBE: 90}},
	})
	if err != nil {
		t.Fatalf("ChooseRecommendation error: %v", err)
	}
	if resp.Pilihan != "naikkan_speed" || resp.Sumber != "jev" || !resp.SelisihDenganBE {
		t.Errorf("respons tidak utuh: %+v", resp)
	}
	if len(gotBody.Kandidat) != 1 || gotBody.Kandidat[0].Kode != "geser_jadwal" {
		t.Errorf("kandidat tidak terkirim: %+v", gotBody)
	}
}
