package master

import (
	"strconv"
	"strings"
)

// ParseAngkaID membaca angka dari sel master data. Nilai resmi paket
// Greenfields memakai gaya Indonesia: titik sebagai pemisah ribuan
// (10.000 berarti 10000) dan koma sebagai pemisah desimal. Sel penanda
// ("X", "N/A", kosong) bukan angka dan mengembalikan ok=false; pemanggil
// memutuskan sendiri nilai cadangannya, fungsi ini tidak mengarang angka.
func ParseAngkaID(s string) (float64, bool) {
	s = strings.TrimSpace(s)
	if s == "" || strings.EqualFold(s, "X") || strings.EqualFold(s, "N/A") {
		return 0, false
	}
	s = strings.ReplaceAll(s, ".", "")
	s = strings.ReplaceAll(s, ",", ".")
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0, false
	}
	return v, true
}

// DurasiChangeoverMenit mengembalikan durasi resmi per rule_id dari tabel
// changeover_rules (VARIANT 45, SIZE 60, PAPER 15, NONE 0 menit). Rule yang
// durasinya tidak terbaca sebagai angka tidak dimasukkan ke peta.
func (c *Catalog) DurasiChangeoverMenit() map[string]int {
	out := map[string]int{}
	for _, row := range c.Tables["changeover_rules"] {
		if v, ok := ParseAngkaID(row["duration_minutes"]); ok {
			out[row["rule_id"]] = int(v)
		}
	}
	return out
}
