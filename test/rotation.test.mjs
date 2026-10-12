import test from 'node:test';
import assert from 'node:assert/strict';
import {rotationIndex} from '../public/site.js';
const site={cards:[{}, {}, {}],startDate:'2026-10-12',timeZone:'Europe/Moscow'};
test('Daily cards use one shared calendar and loop after all cards',()=>{
  assert.equal(rotationIndex(site,new Date('2026-10-11T20:59:59Z')),0);
  assert.equal(rotationIndex(site,new Date('2026-10-11T21:00:00Z')),0);
  assert.equal(rotationIndex(site,new Date('2026-10-12T20:59:59Z')),0);
  assert.equal(rotationIndex(site,new Date('2026-10-12T21:00:00Z')),1);
  assert.equal(rotationIndex(site,new Date('2026-10-13T21:00:00Z')),2);
  assert.equal(rotationIndex(site,new Date('2026-10-14T21:00:00Z')),0);
  assert.equal(rotationIndex(site,new Date('2026-10-15T21:00:00Z')),1);
});
test('No cards, one card, leap day and configured timezone',()=>{
  assert.equal(rotationIndex({...site,cards:[]}),-1);
  assert.equal(rotationIndex({...site,cards:[{}]},new Date('2027-01-01')),0);
  assert.equal(rotationIndex({...site,startDate:'2028-02-28',timeZone:'UTC'},new Date('2028-03-01T00:00:00Z')),2);
  assert.equal(rotationIndex({...site,timeZone:'America/New_York'},new Date('2026-10-13T03:59:59Z')),0);
  assert.equal(rotationIndex({...site,timeZone:'America/New_York'},new Date('2026-10-13T04:00:00Z')),1);
});
