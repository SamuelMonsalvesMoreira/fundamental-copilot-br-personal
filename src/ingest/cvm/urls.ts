/** Endereços dos arquivos do Portal de Dados Abertos da CVM. */

export const CVM_BASE = "https://dados.cvm.gov.br/dados/CIA_ABERTA";

export const cvmUrls = {
  cadastro: `${CVM_BASE}/CAD/DADOS/cad_cia_aberta.csv`,
  fca: (year: number) => `${CVM_BASE}/DOC/FCA/DADOS/fca_cia_aberta_${year}.zip`,
  dfp: (year: number) => `${CVM_BASE}/DOC/DFP/DADOS/dfp_cia_aberta_${year}.zip`,
  itr: (year: number) => `${CVM_BASE}/DOC/ITR/DADOS/itr_cia_aberta_${year}.zip`,
};

export const CVM_SOURCE = "CVM Dados Abertos";

/** "84.429.695/0001-11" → "84429695000111" */
export function cnpjDigits(cnpj: string): string {
  return cnpj.replace(/\D/g, "").padStart(14, "0");
}

/** Remove acentos e padroniza caixa/espaços para comparar descrições. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
