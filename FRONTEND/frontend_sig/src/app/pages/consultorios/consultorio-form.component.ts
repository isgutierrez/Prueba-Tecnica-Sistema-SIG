import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';

export interface ConsultorioFormValue {
  identifica: string | null;
  codigo_de: string | null;
  nombre_de: string | null;
  direccion: string | null;
  telefono?: string | null;
  tipo_de_pr?: string | null;
  clase_de_p?: string | null;
  codigo_loc?: number | null;
  codigo_upz?: number | null;
  latitud: number | null;
  longitud: number | null;
}

@Component({
  selector: 'app-consultorio-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './consultorio-form.component.html'
})
export class ConsultorioFormComponent implements OnInit, OnChanges {
  @Input({ required: true }) title = 'Consultorio';
  @Input() loading = false;
  @Input() submissionError: string | null = null;
  @Input() initialValue: Partial<ConsultorioFormValue> | null = null;

  @Output() submitConsultorio = new EventEmitter<ConsultorioFormValue>();
  @Output() cancel = new EventEmitter<void>();

  form!: FormGroup;

  constructor(private readonly fb: FormBuilder) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      identifica: ['', [Validators.required, Validators.maxLength(50)]],
      codigo_de: ['', [Validators.required, Validators.maxLength(50)]],
      nombre_de: ['', [Validators.required, Validators.maxLength(200)]],
      direccion: ['', [Validators.required, Validators.maxLength(250)]],
      telefono: ['', [Validators.maxLength(50)]],
      tipo_de_pr: ['', [Validators.maxLength(120)]],
      clase_de_p: ['', [Validators.maxLength(120)]],
      codigo_loc: [null as number | null],
      codigo_upz: [null as number | null],
      latitud: [0, [Validators.required, Validators.min(-90), Validators.max(90)]],
      longitud: [0, [Validators.required, Validators.min(-180), Validators.max(180)]]
    });

    if (this.initialValue) {
      this.patchFormWithInitialValue(this.initialValue);
    }

    this.updateFormDisabledState();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['loading'] && this.form) {
      this.updateFormDisabledState();
    }

    if (changes['initialValue'] && this.initialValue && this.form) {
      this.patchFormWithInitialValue(this.initialValue);
    }
  }

  onSubmit(): void {
    if (this.form.invalid || this.loading) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();

    this.submitConsultorio.emit({
      ...value,
      identifica: value.identifica ?? '',
      codigo_de: value.codigo_de ?? '',
      nombre_de: value.nombre_de ?? '',
      direccion: value.direccion ?? '',
      telefono: value.telefono ?? '',
      tipo_de_pr: value.tipo_de_pr ?? '',
      clase_de_p: value.clase_de_p ?? '',
      codigo_loc:
        value.codigo_loc !== null && value.codigo_loc !== undefined
          ? Number(value.codigo_loc)
          : null,
      codigo_upz:
        value.codigo_upz !== null && value.codigo_upz !== undefined
          ? Number(value.codigo_upz)
          : null,
      latitud: value.latitud ?? 0,
      longitud: value.longitud ?? 0
    });
  }

  onCancel(): void {
    if (!this.loading) this.cancel.emit();
  }

  private patchFormWithInitialValue(value: Partial<ConsultorioFormValue>): void {
    if (!this.form) return;
    this.form.patchValue({
      identifica: value.identifica ?? '',
      codigo_de: value.codigo_de ?? '',
      nombre_de: value.nombre_de ?? '',
      direccion: value.direccion ?? '',
      telefono: value.telefono ?? '',
      tipo_de_pr: value.tipo_de_pr ?? '',
      clase_de_p: value.clase_de_p ?? '',
      codigo_loc: value.codigo_loc ?? null,
      codigo_upz: value.codigo_upz ?? null,
      latitud: value.latitud ?? 0,
      longitud: value.longitud ?? 0
    });
  }

  private updateFormDisabledState(): void {
    if (!this.form) return;
    if (this.loading) {
      this.form.disable({ emitEvent: false });
    } else {
      this.form.enable({ emitEvent: false });
    }
  }
}
