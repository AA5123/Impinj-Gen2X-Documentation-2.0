**Description:**
Retrieves and displays the current Gen2X configuration stored on the reader, including all enabled features and their settings.

**Usage:**
Send this command with an empty payload to query the reader's current Gen2X configuration state. The response will contain only the latest configured feature (for example, just TagFocus if that was the last action). Use this command to verify the most recent configuration change before starting the reader or to audit the current setting. If no Gen2X configuration has been set, the response returns an empty configuration object.

**Parameters (MQTT & REST):**

_No parameters required._

<div class="endpoint-block"><div class="ep-heading ep-mqtt">MQTT Endpoint Details</div><table class="endpoint-table"><tbody><tr><td>Command</td><td><code>get_impinjGen2X</code></td></tr></tbody></table></div>

<div class="endpoint-block"><div class="ep-heading ep-rest">REST Endpoint Details</div><table class="endpoint-table"><tbody><tr><td>Method</td><td><span class="ep-method ep-method-get">GET</span></td></tr><tr><td>Path</td><td><code>/cloud/impinjGen2X</code></td></tr><tr><td>Request URL</td><td><code>https://&lt;device-ip&gt;/cloud/impinjGen2X</code></td></tr><tr><td>Content-Type</td><td><code>application/json</code></td></tr></tbody></table></div>