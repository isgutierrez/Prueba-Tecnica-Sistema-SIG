export interface Consultorio {
  id: number;
  identifica: string;
  codigo_de: string;
  nombre_de: string;
  direccion: string;
  telefono?: string;
  tipo_de_pr?: string;
  clase_de_p?: string;
  codigo_loc?: number;
  codigo_upz?: number;
  coordenadas: [number, number];
}
//Filtros de busqueda para consultar los consultorios
export interface ConsultorioFilters {
  q?: string;
  tipo_prestador?: string;
  localidad?: number;
  upz?: number;
}
// Creacion y actualizacion de consultorios
export interface ConsultorioPayload {
  identifica?: string;
  codigo_de?: string;
  nombre_de: string;
  direccion: string;
  telefono?: string;
  tipo_de_pr?: string;
  clase_de_p?: string;
  codigo_loc?: number | null;
  codigo_upz?: number | null;
  coordenadas: [number, number];
  latitud?: number | null;
  longitud?: number | null;
  geom?: string; 
  correo_ele?: string;
  nombre_del?: string;
}

export interface ConsultorioResponse {
  data: Consultorio[];
}

export interface ConsultorioDetailResponse {
  data: Consultorio;
}
