import assert from 'node:assert/strict';
import test from 'node:test';
import { TempFileManagerSkill } from '../src/skills/core/TempFileManagerSkill.js';

function createSkill(content, maxFileReadChars)
{
  const skill = new TempFileManagerSkill({ maxFileReadChars });

  skill._getFile = async () => ({
    mimeType: 'text/plain',
    data: Buffer.from(content, 'utf8'),
  });

  return skill;
}

test('temp_file_read preserves the string result when the complete file fits', async () =>
{
  const skill = createSkill('first\nsecond\nthird', 100);
  const result = await skill.temp_file_read({ tempFileName: 'notes.txt' });

  assert.equal(result, 'first\nsecond\nthird');
});

test('temp_file_read automatically paginates a 334-line file', async () =>
{
  const content = Array.from({ length: 334 }, (_, index) => `line-${String(index + 1).padStart(3, '0')}`).join('\n');
  const skill = createSkill(content, 100);
  const result = await skill.temp_file_read({ tempFileName: 'large.txt' });

  assert.equal(result.truncated, true);
  assert.equal(result.startLine, 1);
  assert.equal(result.endLine, 11);
  assert.equal(result.totalLineCount, 334);
  assert.equal(result.content, content.split('\n').slice(0, 11).join('\n'));
  assert.deepEqual(result.nextReadArguments, {
    tempFileName: 'large.txt',
    startLine: 12,
    endLine: 334,
    pagination: true,
  });
});

test('temp_file_read successive pages contain every line exactly once', async () =>
{
  const lines = Array.from({ length: 334 }, (_, index) => `line-${String(index + 1).padStart(3, '0')}`);
  const skill = createSkill(lines.join('\n'), 100);
  const readLines = [];
  let result = await skill.temp_file_read({ tempFileName: 'large.txt' });

  while (typeof result !== 'string')
  {
    readLines.push(...result.content.split('\n'));

    if (!result.truncated)
    {
      break;
    }

    result = await skill.temp_file_read(result.nextReadArguments);
  }

  assert.deepEqual(readLines, lines);
  assert.equal(result.truncated, false);
  assert.equal(result.endLine, 334);
  assert.equal(result.nextReadArguments, null);
});

test('temp_file_read paginates an explicit oversized range without exceeding its end', async () =>
{
  const lines = Array.from({ length: 40 }, (_, index) => `line-${String(index + 1).padStart(2, '0')}`);
  const skill = createSkill(lines.join('\n'), 55);
  const result = await skill.temp_file_read({ tempFileName: 'range.txt', startLine: 10, endLine: 25 });

  assert.equal(result.startLine, 10);
  assert.ok(result.endLine < 25);
  assert.equal(result.content, lines.slice(9, result.endLine).join('\n'));
  assert.equal(result.nextReadArguments.startLine, result.endLine + 1);
  assert.equal(result.nextReadArguments.endLine, 25);
});

test('temp_file_read defaults a missing endLine to 100 lines after startLine and reports the effective range', async () =>
{
  const lines = Array.from({ length: 200 }, (_, index) => `line-${index + 1}`);
  const skill = createSkill(lines.join('\n'), 2000);
  const result = await skill.temp_file_read({ tempFileName: 'range.txt', startLine: 75 });

  assert.equal(result.content, lines.slice(74, 175).join('\n'));
  assert.equal(result.truncated, false);
  assert.equal(result.startLine, 75);
  assert.equal(result.endLine, 175);
  assert.equal(result.totalLineCount, 200);
  assert.equal(result.nextReadArguments, null);
});

test('temp_file_read limits a default endLine to the actual last line', async () =>
{
  const lines = Array.from({ length: 150 }, (_, index) => `line-${index + 1}`);
  const skill = createSkill(lines.join('\n'), 2000);
  const result = await skill.temp_file_read({ tempFileName: 'range.txt', startLine: 125 });

  assert.equal(result.content, lines.slice(124).join('\n'));
  assert.equal(result.startLine, 125);
  assert.equal(result.endLine, 150);
});

test('temp_file_read includes line number prefixes in pagination size', async () =>
{
  const lines = Array.from({ length: 20 }, (_, index) => `value-${index + 1}`);
  const skill = createSkill(lines.join('\n'), 40);
  const result = await skill.temp_file_read({ tempFileName: 'numbered.txt', lineNumbers: true });

  assert.equal(result.content, '1 | value-1\n2 | value-2\n3 | value-3');
  assert.ok(result.content.length <= 40);
  assert.deepEqual(result.nextReadArguments, {
    tempFileName: 'numbered.txt',
    startLine: 4,
    endLine: 20,
    lineNumbers: true,
    pagination: true,
  });
});

test('temp_file_read rejects a single line exceeding the read limit', async () =>
{
  const skill = createSkill('x'.repeat(101), 100);

  await assert.rejects(
    skill.temp_file_read({ tempFileName: 'single-line.txt' }),
    /pagination by lines is impossible.*temp_file_search.*specialized tool/i,
  );
});
