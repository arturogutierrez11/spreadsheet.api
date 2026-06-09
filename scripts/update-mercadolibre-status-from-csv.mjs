import { readFile } from 'node:fs/promises';
import process from 'node:process';

const DEFAULT_API_URL =
  'https://spreadsheet.loquieroaca.com/sheet/orders';
const DEFAULT_DELAY_MS = 150;
const MAX_ATTEMPTS = 3;

const options = parseArguments(process.argv.slice(2));

if (!options.file) {
  printUsage();
  process.exitCode = 1;
} else {
  await run(options);
}

async function run({ file, execute, apiUrl, delayMs }) {
  const rows = await readRows(file);

  console.log(
    `${execute ? 'EXECUTE' : 'DRY RUN'}: ${rows.length} unique orders from ${file}`,
  );
  console.log(`Endpoint: ${apiUrl}`);

  if (!execute) {
    console.log('No requests were sent. Add --execute to enqueue the updates.');
    console.table(rows.slice(0, 10));
    return;
  }

  let queued = 0;
  const failures = [];

  for (const [index, row] of rows.entries()) {
    try {
      const response = await enqueueUpdate(apiUrl, row);
      queued += 1;
      console.log(
        `[${index + 1}/${rows.length}] queued NROVENTA=${row.orderNumber} jobId=${response.jobId ?? ''}`,
      );
    } catch (error) {
      failures.push({
        line: row.line,
        orderNumber: row.orderNumber,
        error: error instanceof Error ? error.message : String(error),
      });
      console.error(
        `[${index + 1}/${rows.length}] failed NROVENTA=${row.orderNumber}: ${failures.at(-1).error}`,
      );
    }

    if (index < rows.length - 1) {
      await sleep(delayMs);
    }
  }

  console.log(`Finished: queued=${queued} failed=${failures.length}`);

  if (failures.length > 0) {
    console.table(failures);
    process.exitCode = 1;
  }
}

async function readRows(file) {
  const content = await readFile(file, 'utf8');
  const parsedRows = content
    .split(/\r?\n/)
    .map((line, index) => parseRow(line, index + 1))
    .filter(Boolean);
  const rowsByOrderNumber = new Map();

  for (const row of parsedRows) {
    if (rowsByOrderNumber.has(row.orderNumber)) {
      throw new Error(
        `Duplicate NROVENTA="${row.orderNumber}" at line ${row.line}.`,
      );
    }

    rowsByOrderNumber.set(row.orderNumber, row);
  }

  return [...rowsByOrderNumber.values()];
}

function parseRow(line, lineNumber) {
  if (line.trim() === '') {
    return null;
  }

  const columns = line.split(',');

  if (columns.length !== 2) {
    throw new Error(`Line ${lineNumber} must contain exactly two columns.`);
  }

  const orderNumber = columns[0].trim();
  const status = columns[1].trim().toLowerCase();

  if (!/^\d+$/.test(orderNumber)) {
    throw new Error(`Invalid NROVENTA at line ${lineNumber}: "${orderNumber}".`);
  }

  if (status !== 'cancelled') {
    throw new Error(
      `Invalid status at line ${lineNumber}: expected "cancelled", received "${status}".`,
    );
  }

  return {
    line: lineNumber,
    orderNumber,
    status,
  };
}

async function enqueueUpdate(apiUrl, row) {
  const body = new URLSearchParams({
    NROVENTA: row.orderNumber,
    'ESTADO MERCADOLIBRE': row.status,
  });
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
        signal: AbortSignal.timeout(15000),
      });
      const responseText = await response.text();

      if (response.status === 202) {
        return parseResponse(responseText);
      }

      const error = new Error(
        `HTTP ${response.status}: ${responseText || response.statusText}`,
      );

      if (!isRetryableStatus(response.status)) {
        throw error;
      }

      lastError = error;
    } catch (error) {
      lastError = error;

      if (
        error instanceof Error &&
        error.message.startsWith('HTTP ') &&
        !error.message.startsWith('HTTP 429') &&
        !error.message.startsWith('HTTP 5')
      ) {
        throw error;
      }
    }

    if (attempt < MAX_ATTEMPTS) {
      await sleep(1000 * 2 ** (attempt - 1));
    }
  }

  throw lastError;
}

function parseResponse(responseText) {
  if (!responseText) {
    return {};
  }

  try {
    return JSON.parse(responseText);
  } catch {
    return { responseText };
  }
}

function isRetryableStatus(status) {
  return status === 429 || status >= 500;
}

function parseArguments(args) {
  const options = {
    apiUrl: DEFAULT_API_URL,
    delayMs: DEFAULT_DELAY_MS,
    execute: false,
    file: undefined,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === '--execute') {
      options.execute = true;
      continue;
    }

    if (argument === '--file') {
      options.file = args[index + 1];
      index += 1;
      continue;
    }

    if (argument === '--url') {
      options.apiUrl = args[index + 1];
      index += 1;
      continue;
    }

    if (argument === '--delay-ms') {
      options.delayMs = Number(args[index + 1]);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!Number.isFinite(options.delayMs) || options.delayMs < 0) {
    throw new Error('--delay-ms must be a non-negative number.');
  }

  return options;
}

function sleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function printUsage() {
  console.log(`
Usage:
  node scripts/update-mercadolibre-status-from-csv.mjs --file /path/orders.csv
  node scripts/update-mercadolibre-status-from-csv.mjs --file /path/orders.csv --execute

Options:
  --execute          Send requests. Without this flag, the script is a dry run.
  --url URL          Override the API endpoint.
  --delay-ms NUMBER  Delay between requests. Default: ${DEFAULT_DELAY_MS}.
`);
}
