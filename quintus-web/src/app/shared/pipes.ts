import { Pipe, PipeTransform } from '@angular/core';
import { eur, frDate, n2, pct, qty } from './format';

@Pipe({ name: 'eur' })
export class EurPipe implements PipeTransform {
  transform = eur;
}
@Pipe({ name: 'n2' })
export class N2Pipe implements PipeTransform {
  transform = n2;
}
@Pipe({ name: 'pct' })
export class PctPipe implements PipeTransform {
  transform = pct;
}
@Pipe({ name: 'qty' })
export class QtyPipe implements PipeTransform {
  transform = qty;
}
@Pipe({ name: 'frDate' })
export class FrDatePipe implements PipeTransform {
  transform = frDate;
}

export const FORMAT_PIPES = [EurPipe, N2Pipe, PctPipe, QtyPipe, FrDatePipe] as const;
