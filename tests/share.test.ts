// Run with: npx tsx tests/share.test.ts
import assert from 'node:assert/strict';
import { cleanSharedTitle, parseAddHash, shortCourse } from '../src/shareAdd';

const timetable = [
  '4343SNACSY - Social Network Analysis for Computer Scientists - Hoorcollege',
  '4343TXTMN - Text Mining - Werkcollege',
  '4343ADVDM - Advanced Data Mining - Hoorcollege',
];
const cases: [string, string][] = [
  ['Assignment 2: Graph Mining - Social Network Analysis for Computer Scientists (4343SNACSY) - Brightspace', 'SNACS · Assignment 2: Graph Mining'],
  ['Assignment 2: Graph Mining - 4343SNACSY - Leiden University', 'SNACS · Assignment 2: Graph Mining'],
  ['Project report | Advanced Data Mining | Brightspace', 'Advanced Data Mining · Project report'],
  ['Fwd: [ADM] Project report due Friday 17:00', 'ADM · Project report due Friday 17:00'],
  ['Re: RE: Text Mining A2 feedback', 'Text Mining A2 feedback'],
  ['Final exam (4343TXTMN)', 'Text Mining · Final exam'],
  ['Homework 3 – Brightspace', 'Homework 3'],
  ['Brightspace', ''],
  ['https://brightspace.universiteitleiden.nl/d2l/lms/dropbox/user/folder_submit_files.d2l?db=123456&ou=98765', ''],
  ['https://example.com/courses/a2-graph-mining.pdf', 'a2 graph mining'],
  ['', ''],
];
let passed = 0;
for (const [input, want] of cases) {
  assert.equal(cleanSharedTitle(input, timetable), want, input);
  passed++;
}
assert.equal(shortCourse('Social Network Analysis for Computer Scientists'), 'SNACS');
assert.equal(shortCourse('Text Mining'), 'Text Mining');
assert.equal(parseAddHash('#add=Assignment%202%20%E2%80%93%20Brightspace'), 'Assignment 2 – Brightspace');
assert.equal(parseAddHash('#sync=done&result=x'), null);
assert.ok(cleanSharedTitle('x'.repeat(200)).length <= 80);
console.log(`${passed + 5} share tests passed`);
