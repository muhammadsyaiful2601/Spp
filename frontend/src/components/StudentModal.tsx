import type { ModalKind } from "../types";
import { Plus, X } from "lucide-react";

export function StudentModal({
  addStudent,
  classLevels,
  setModal,
}: {
  addStudent: (event: React.FormEvent<HTMLFormElement>) => void;
  classLevels: string[];
  modal: ModalKind;
  setModal: (value: ModalKind) => void;
}) {
  return (
          <div
            className="modal-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setModal(null);
            }}
          >
            <form className="modal" onSubmit={addStudent}>
              <div className="modal-head">
                <div>
                  <div className="eyebrow">DATA SISWA</div>
                  <h2>Tambah siswa baru</h2>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Tutup"
                  onClick={() => setModal(null)}
                >
                  <X size={19} />
                </button>
              </div>
              <div className="form-grid">
                <div className="form-field">
                  <label htmlFor="new-id">NIS</label>
                  <input
                    id="new-id"
                    name="id"
                    placeholder="Contoh: 2401008"
                    required
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="new-nisn">NISN</label>
                  <input
                    id="new-nisn"
                    name="nisn"
                    placeholder="10 digit NISN"
                    required
                  />
                </div>
                <div className="form-field full">
                  <label htmlFor="new-name">Nama lengkap</label>
                  <input
                    id="new-name"
                    name="name"
                    placeholder="Nama siswa"
                    required
                  />
                </div>
                <div className="form-field full">
                  <label htmlFor="new-class">Tingkat kelas</label>
                  <select id="new-class" name="className" required>
                    {classLevels.length === 0 ? (
                      <option value="">Belum ada tingkat kelas</option>
                    ) : (
                      classLevels.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="button button-outline"
                  onClick={() => setModal(null)}
                >
                  Batal
                </button>
                <button className="button button-primary" type="submit">
                  <Plus size={16} /> Simpan siswa
                </button>
              </div>
            </form>
          </div>
        
  );
}

export default StudentModal;
