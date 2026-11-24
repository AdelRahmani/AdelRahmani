import { ChangeDetectionStrategy, Component, ElementRef, signal, viewChild } from '@angular/core';

/** Confirmation dans la page : les dialogues natifs du navigateur sont bloqués dans certains hôtes */
@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dlg (close)="resolve(false)">
      <div class="dlg-body">
        <h3>Confirmer</h3>
        <p>{{ text() }}</p>
      </div>
      <div class="dlg-foot">
        <button class="btn ghost" type="button" (click)="resolve(false)">Annuler</button>
        <button class="btn danger" type="button" (click)="resolve(true)">{{ action() }}</button>
      </div>
    </dialog>
  `,
})
export class ConfirmDialog {
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  protected readonly text = signal('');
  protected readonly action = signal('Supprimer');
  private pending?: (ok: boolean) => void;

  ask(text: string, action = 'Supprimer'): Promise<boolean> {
    this.text.set(text);
    this.action.set(action);
    this.dlg().nativeElement.showModal();
    return new Promise((r) => (this.pending = r));
  }

  protected resolve(ok: boolean): void {
    const p = this.pending;
    this.pending = undefined;
    if (this.dlg().nativeElement.open) this.dlg().nativeElement.close();
    p?.(ok);
  }
}
