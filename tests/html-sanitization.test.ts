import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sanitizeRichHtml } from '../app/utils/sanitizeHtml'

test('rich HTML sanitizer preserves editor structure and removes executable markup', () => {
  const sanitized = sanitizeRichHtml(`
    <h2 onclick="alert(1)">Terms</h2>
    <p style="color:red">Read <strong>carefully</strong>.</p>
    <script>alert('xss')</script>
    <iframe src="https://example.com"></iframe>
    <a href="javascript:alert(1)" target="_blank">unsafe</a>
    <a href="https://fo.studio/policies" target="_blank">safe</a>
    <hr>
  `)

  assert.match(sanitized, /<h2>Terms<\/h2>/)
  assert.match(sanitized, /<p>Read <strong>carefully<\/strong>\.<\/p>/)
  assert.match(sanitized, /href="https:\/\/fo\.studio\/policies"/)
  assert.match(sanitized, /rel="noopener noreferrer"/)
  assert.match(sanitized, /<hr>/)
  assert.doesNotMatch(sanitized, /script|iframe|onclick|style=|javascript:/i)
})

test('rich HTML sanitizer unwraps harmless unknown containers', () => {
  assert.equal(sanitizeRichHtml('<section><p>Visible</p></section>'), '<p>Visible</p>')
})
