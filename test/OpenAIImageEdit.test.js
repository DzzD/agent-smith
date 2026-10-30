import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenAIImageEdit } from '../src/net/client/openai/OpenAIImageEdit.js';
import { OpenAiImageSkill } from '../src/skills/beta/OpenAiImageSkill.js';

test('OpenAIImageEdit appends an optional mask to the image edit form', async () =>
{
  const client = new OpenAIImageEdit({ apiKey: 'test-key', model: 'image-model' });
  let requestFormData;

  client.postForm = async (path, formData) =>
  {
    assert.equal(path, 'images/edits');
    requestFormData = formData;
    return {
      endpointUrl: 'https://api.openai.com/v1/images/edits',
      payload: { data: [{ b64_json: Buffer.from('EDITED').toString('base64') }] },
    };
  };

  const response = await client.editImage({
    prompt: 'Replace the masked area.',
    imageBase64: Buffer.from('IMAGE').toString('base64'),
    imageMimeType: 'image/png',
    maskBase64: Buffer.from('MASK').toString('base64'),
    maskMimeType: 'image/png',
  });

  assert.equal(requestFormData.getAll('image[]').length, 1);
  assert.equal(await requestFormData.get('mask').text(), 'MASK');
  assert.equal(requestFormData.get('mask').type, 'image/png');
  assert.equal(response.imageBuffer.toString(), 'EDITED');
});

test('OpenAiImageSkill loads and forwards an optional mask temp file', async () =>
{
  const skill = new OpenAiImageSkill({ url: 'https://example.test/', apiKey: 'test-key', model: 'image-model' });
  let editArgs;
  const files = new Map([
    ['source.png', { mimeType: 'image/png', data: Buffer.from('SOURCE') }],
    ['mask.png', { mimeType: 'image/png', data: Buffer.from('MASK') }],
  ]);
  const tempFileManagerSkill = {
    async _getFile(tempFileName) { return files.get(tempFileName); },
    async temp_file_read({ tempFileName }) { return files.get(tempFileName).data.toString('base64'); },
    async getFiles() { return files; },
    async temp_file_create({ tempFileName, mimeType }) { files.set(tempFileName, { mimeType, data: Buffer.alloc(0) }); },
    async appendBuffer({ tempFileName, data }) { files.get(tempFileName).data = data; },
  };
  skill.agent = { skills: new Map([['TempFileManagerSkill', tempFileManagerSkill]]) };
  skill.imageEditClient = {
    async editImage(args)
    {
      editArgs = args;
      return { imageBuffer: Buffer.from('EDITED') };
    },
  };

  const result = await skill.open_ai_edit_image({
    prompt: 'Replace the masked area.',
    inputImages: [{ tempFileName: 'source.png', role: 'source', description: 'Main image.' }],
    maskTempFileName: 'mask.png',
    outputTempFileName: 'edited.png',
    outputMimeType: 'image/png',
  }, { streamId: 'stream-1' });

  assert.equal(Buffer.from(editArgs.maskBase64, 'base64').toString(), 'MASK');
  assert.equal(editArgs.maskMimeType, 'image/png');
  assert.equal(files.get('edited.png').data.toString(), 'EDITED');
  assert.equal(result.tempFileName, 'edited.png');
});