// Yields the `data:` payload of each Server-Sent Event in a byte stream.
export async function* parseSSE(stream) {
  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, '\n');
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const event = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = event
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''))
        .join('\n');
      if (data) yield data;
    }
  }
}
