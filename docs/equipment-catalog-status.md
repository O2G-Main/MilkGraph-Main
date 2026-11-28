# Alat — katalog Greenfields dan status

Menu **Master → Alat** memiliki tab Katalog alat (default), Status, Pengaturan, dan Konfigurasi lini. Tidak ada menu Kondisi Alat kedua.

Katalog alat membaca `GET /master/assets`, yaitu daftar bawaan Greenfields beserta perubahan parameter yang tersimpan di BE. UI tidak membuat daftar alat baru, melakukan seeding, atau mengganti kegagalan API dengan data simulasi. Daftar master mencakup alat, tangki, lini, dan titik konfigurasi sesuai respons server; jumlahnya tidak di-hardcode. Pencarian/jenis menyaring katalog, sedangkan modal Spesifikasi menunjukkan parameter berdasarkan ID yang sama. Parameter kosong/N/A/X dibedakan dari nol.

Tab Status menggunakan katalog operasional `GET /production/assets`, catatan status, dan layanan downtime/maintenance yang sudah ada. Tombol Lihat status pada satu entri master memindahkan ke `/alat?tab=status&asset=ID`, memfilter alat terpilih, memfokuskan region Status untuk keyboard, dan memakai ID itu sebagai konteks prediksi downtime. Cakupan termasuk pipa aktif saat membawa ID spesifik agar entri master tersebut dapat dicari; kunjungan Status tanpa ID memakai cakupan operasional standar. Dropdown status memakai label yang terbaca, sementara filter dan pencatatan tetap memakai nilai BE asli. Pencatatan tetap memeriksa izin backend.

`/kondisi-alat` mengalihkan ke `/alat?tab=status`; parameter asset atau alat diteruskan. Redirect statis lama di Next config dihapus supaya konteks alat tidak hilang. `/alat?alat=ID` juga diterima sebagai tautan lama. Tab dan ID di URL bertahan saat reload. Pengaturan dan Konfigurasi lini tetap tersedia.

Verifikasi: typecheck/lint, seluruh tes Node dan build; `tests/equipment-catalog-status-browser.mjs` memeriksa default master, detail/nol, status/konteks/fokus/reload, pipa, tautan lama, pencarian, error/kosong, satu judul halaman, serta lebar 320/768/1024/1440 px. API tiruan hanya GET. Browser API langsung juga hanya GET dan mengamati 63 entri master pada saat pengujian, bukan konstanta aplikasi.

Regresi modal ikut diperiksa. Pembaruan font upstream 6e85f12 dipertahankan; ukuran, padding, tinggi dan header modal bersama dari 5fc4278 dipulihkan karena sempat tertimpa pada pembaruan CSS itu.
