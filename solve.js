// Fast CSV reader: a faster drop-in for csv-reader 1.0.0, make.fun's own reference program.
// run(input) returns, for every {text, header}, exactly the answer csv-reader 1.0.0 returns:
// {columns, rows, errors}. The reading policy is csv-reader's own:
//
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside a quoted field a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not doubled, "" inside it one
//     quote, and each CRLF or lone CR inside it is read as LF; what follows its closing quote, up to
//     the next comma or line break, is appended as it stands (quote_junk, when the field ends); a
//     quote that never closes is a literal character, and the text after it is read again as an
//     unquoted field (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay strings, never trimmed
//     or converted;
//   - columns is the first record when header is true, else null; rows holds the records after it
//     (every record when header is false), each padded with "" (short_row, with fields: its field
//     count) or cut (long_row, with extra: the cut fields) to the first record's width;
//   - each error is {code, line, row}, in the order met, a field's quote_junk when the field ends
//     and a record's short_row or long_row when the record ends: line the 1-based line its record
//     starts on, counting every LF, CRLF and lone CR inside quotes, and row its record's index in
//     rows, null for the header.
//
// Speed: the reference reads one character at a time, each field built a character at a time. This
// reader finds each field's end with String.indexOf (native code) and takes the field with
// String.slice, so the common unquoted field costs two native scans and one slice, and a quoted
// field finds its closing quote the same way. Only broken fields take a slower path: stray CRs in
// an unquoted field, doubled quotes, and line breaks inside quotes, each rare in the drawn sets.
// Deterministic: no clock, no randomness, no locale, nothing kept between calls.

/** How a field ended: at a comma (the record goes on), at a line break or at the end of the text. */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input, read faster. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The next LF at or after the position it was last computed for: -2 unknown, -1 none in the
  // rest of the text (sticky: once there is no LF after a position, there is none after any later
  // one), else its position. A field never spans an LF unless quoted, so the cached break stays
  // the next one until pos passes it; a quoted field that swallowed a line break leaves it behind
  // pos, which the check below catches and recomputes.
  let lineEnd = -2;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // The last field read: its value, how it ended, and how many characters the read kept (kept
  // characters matter only for quote_junk: junk that added nothing is no error).
  let fValue = '';
  let fEnded = END;
  let fAdded = 0;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads unquoted characters from pos, appended to `prefix`, up to the next comma or line break.
  // A CR not followed by LF is dropped (stray_cr). Sets fValue, fEnded, fAdded.
  function readUnquoted(prefix) {
    const p = pos;
    const c = text.indexOf(',', p);
    if (lineEnd === -2 || (lineEnd !== -1 && lineEnd < p)) lineEnd = text.indexOf('\n', p);
    const n = lineEnd;
    let end;
    let ended;
    let crlf = false;
    if (c !== -1 && (n === -1 || c < n)) {
      end = c;
      ended = COMMA;
    } else if (n !== -1) {
      // A CR just before the LF is the CRLF's, part of the break, never a stray CR.
      if (n > p && text.charCodeAt(n - 1) === 13) {
        end = n - 1;
        crlf = true;
      } else {
        end = n;
      }
      ended = LINE_BREAK;
    } else {
      end = len;
      ended = END;
    }
    const seg = text.slice(p, end);
    if (seg.indexOf('\r') === -1) {
      fValue = prefix === '' ? seg : prefix + seg;
      fAdded = seg.length;
      fEnded = ended;
      pos = ended === COMMA ? end + 1 : ended === LINE_BREAK ? (crlf ? end + 2 : end + 1) : len;
      if (ended === LINE_BREAK) line += 1;
      return;
    }
    // Stray CRs in the field: drop each (one error apiece) and keep the rest. Every CR in this
    // region is stray: one followed by LF would have made that LF the nearer break, and the
    // CRLF's own CR sits at `end`, outside the region.
    let value = prefix;
    let added = 0;
    let s = p;
    for (;;) {
      const r = text.indexOf('\r', s);
      if (r === -1 || r >= end) {
        const tail = text.slice(s, end);
        value += tail;
        added += tail.length;
        break;
      }
      const part = text.slice(s, r);
      value += part;
      added += part.length;
      error('stray_cr');
      s = r + 1;
    }
    fValue = value;
    fAdded = added;
    fEnded = ended;
    pos = ended === COMMA ? end + 1 : ended === LINE_BREAK ? (crlf ? end + 2 : end + 1) : len;
    if (ended === LINE_BREAK) line += 1;
  }

  // Reads a quoted field whose opening quote is at pos. Sets fValue, fEnded, fAdded.
  function readQuoted() {
    const open = pos;
    let p = open + 1;
    let segStart = p;
    let parts = null;
    for (;;) {
      const q = text.indexOf('"', p);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text after it is read
        // again as unquoted. The line was never moved during the scan, so it is already the
        // opening line, as the reference's reset leaves it.
        error('unterminated_quote');
        pos = open + 1;
        readUnquoted('"');
        return;
      }
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote: one quote in the value, and the field runs on.
        if (parts === null) parts = [];
        parts.push(text.slice(segStart, q));
        parts.push('"');
        p = q + 2;
        segStart = q + 2;
        continue;
      }
      // The closing quote is at q.
      let content;
      if (parts === null) {
        content = text.slice(segStart, q);
      } else {
        parts.push(text.slice(segStart, q));
        content = parts.join('');
      }
      let value;
      if (content.indexOf('\r') === -1) {
        value = content;
        if (content.indexOf('\n') !== -1) {
          // Line breaks inside the quotes count, though the value keeps them as they are.
          let nl = 0;
          let at = -1;
          while ((at = content.indexOf('\n', at + 1)) !== -1) nl++;
          line += nl;
        }
      } else {
        // CRLF and a lone CR inside quotes are each one LF, and each counts a line.
        let out = '';
        let nl = 0;
        let s = 0;
        let i = 0;
        const cl = content.length;
        while (i < cl) {
          const ch = content.charCodeAt(i);
          if (ch === 13) {
            out += content.slice(s, i);
            out += '\n';
            nl++;
            i += content.charCodeAt(i + 1) === 10 ? 2 : 1;
            s = i;
          } else if (ch === 10) {
            out += content.slice(s, i);
            out += '\n';
            nl++;
            i++;
            s = i;
          } else {
            i++;
          }
        }
        out += content.slice(s);
        value = out;
        line += nl;
      }
      pos = q + 1;
      if (pos >= len) {
        fValue = value;
        fEnded = END;
        fAdded = 0;
        return;
      }
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        fValue = value;
        fEnded = COMMA;
        fAdded = 0;
        return;
      }
      if (c === 10) {
        pos += 1;
        line += 1;
        fValue = value;
        fEnded = LINE_BREAK;
        fAdded = 0;
        return;
      }
      if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
        fValue = value;
        fEnded = LINE_BREAK;
        fAdded = 0;
        return;
      }
      // What follows the closing quote is appended as it stands, up to the next comma or line
      // break; junk that added nothing (stray CRs alone) is no error.
      readUnquoted(value);
      if (fAdded > 0) error('quote_junk');
      return;
    }
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      if (quoted) readQuoted();
      else readUnquoted('');
      fields.push(fValue);
    } while (fEnded === COMMA);

    // A line that held only stray CRs is left with no characters: no record (its errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
