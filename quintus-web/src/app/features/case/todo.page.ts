import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { CaseStep } from './steps';

/** Écran pas encore porté : rappelle ce que fait le prototype */
@Component({
  selector: 'app-todo-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (step(); as s) {
      <section class="head">
        <div>
          <h1>{{ s.label }}</h1>
        </div>
      </section>
      <div class="empty">
        <p>
          <strong>Écran à porter depuis le prototype.</strong> Les règles de calcul correspondantes
          sont déjà dans le domaine et testées.
        </p>
        <ul class="todo-list">
          @for (t of s.todo ?? []; track t) {
            <li>{{ t }}</li>
          }
        </ul>
      </div>
    }
  `,
})
export class TodoPage {
  protected readonly step = toSignal(
    inject(ActivatedRoute).data.pipe(map((d) => d['step'] as CaseStep)),
  );
}
