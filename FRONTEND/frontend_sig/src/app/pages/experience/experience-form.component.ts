import { Component, EventEmitter, Input, Output, Signal, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

export interface ExperienceFormValue {
  author: string;
  rating: number;
  comment: string;
}

@Component({
  selector: 'app-experience-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './experience-form.component.html'
})
export class ExperienceFormComponent {
  @Input({ required: true }) consultorioName = '';
  @Input() loading = false;
  @Input() submissionError: string | null = null;

  @Output() submitExperience = new EventEmitter<ExperienceFormValue>();
  @Output() cancel = new EventEmitter<void>();

  readonly ratings = [1, 2, 3, 4, 5];

  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.group({
    author: ['', [Validators.required, Validators.maxLength(120)]],
    rating: [5, [Validators.required, Validators.min(1), Validators.max(5)]],
    comment: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(400)]]
  });

  readonly commentLength: Signal<number> = computed(() => this.form.controls.comment.value?.length ?? 0);
  readonly maxCommentLength = 400;
  readonly hoveredRating = signal<number | null>(null);
  readonly displayRating = computed(() => this.hoveredRating() ?? (this.form.controls.rating.value ?? 0));
  readonly activeStarClasses =
    'flex h-10 w-10 items-center justify-center rounded-full bg-white text-2xl text-yellow-400 shadow-md transition transform-gpu hover:-translate-y-0.5 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60';
  readonly inactiveStarClasses =
    'flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-2xl text-slate-300 shadow-sm transition transform-gpu hover:-translate-y-0.5 hover:text-yellow-300 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60';

  onSubmit(): void {
    if (this.form.invalid || this.loading) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitExperience.emit(this.form.getRawValue() as ExperienceFormValue);
  }

  onCancel(): void {
    if (this.loading) {
      return;
    }
    this.cancel.emit();
  }

  setRating(value: number): void {
    if (this.loading) {
      return;
    }
    this.form.controls.rating.setValue(value);
    this.hoveredRating.set(null);
  }

  onStarHover(value: number): void {
    if (this.loading) {
      return;
    }
    this.hoveredRating.set(value);
  }

  resetStarHover(): void {
    this.hoveredRating.set(null);
  }
}
