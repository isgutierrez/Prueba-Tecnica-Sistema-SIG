export interface Experience {
  id: number;
  consultorio: number | string;
  consultorio_nombre?: string;
  author: string;
  comment: string;
  rating: number;
  created_at?: string;
}

export interface ExperienceSummary {
  consultorioNombre: string;
  ratingAverage: number | null;
  ratingCount: number;
  experiences: Experience[];
  services: string[];
}
