export function parseOptions(argv = [])
{
  const options = {};

  for (let index = 0; index < argv.length; index++)
  {
    const current = argv[index];

    if (!current.startsWith('--'))
    {
      continue;
    }

    const key = current.slice(2);
    const next = argv[index + 1];

    if (next === undefined || next.startsWith('--'))
    {
      options[key] = true;
      continue;
    }

    options[key] = next;
    index++;
  }

  return options;
}

export function requiredOption(options, key)
{
  const value = String(options[key] ?? '').trim();

  if (!value)
  {
    throw new Error(`missing_required_option:${key}`);
  }

  return value;
}