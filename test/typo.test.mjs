import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NBSP, typo } from '../public/js/typo.js';

const show = (s) => s.replaceAll(NBSP, '~');

test('no break before French high punctuation, percent and euro', () => {
  assert.equal(show(typo('Équipe : 0 %')), 'Équipe~: 0~%'); // a normal space after the colon may break
  assert.equal(show(typo('Ne signe rien !')), 'Ne signe rien~!');
  assert.equal(show(typo('Prochain plein ?')), 'Prochain plein~?');
  assert.equal(show(typo('117,30 €')), '117,30~€');
  assert.equal(show(typo('« Montre ton ticket »')), '«~Montre ton ticket~»');
});

test('numbers keep their unit', () => {
  assert.equal(show(typo('un plein de 50 L.')), 'un plein de 50~L.');
  assert.equal(show(typo('24 k de volume')), '24~k de volume');
  assert.equal(show(typo('18 ans et plus')), '18~ans et plus');
  assert.equal(show(typo('20 × 2,356 €')), '20~× 2,356~€');
});

test('times, words and already-correct text are left alone', () => {
  assert.equal(typo('samedi 18:00'), 'samedi 18:00');
  assert.equal(typo('12 Lumières'), '12 Lumières');
  assert.equal(typo(typo('Équipe : 0 %')), typo('Équipe : 0 %'));
});
