import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

// A deliberately small markdown renderer: ``` code blocks, `inline code` and **bold**.
// Swap for a full markdown library later if you need tables, lists, links, etc.

type Block = { kind: 'text' | 'code'; content: string; lang?: string };

function splitBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  const fence = /```([\w+-]*)\n?([\s\S]*?)(?:```|$)/g;
  let last = 0;
  let match;
  while ((match = fence.exec(source)) !== null) {
    if (match.index > last) blocks.push({ kind: 'text', content: source.slice(last, match.index) });
    blocks.push({ kind: 'code', lang: match[1], content: match[2].replace(/\n$/, '') });
    last = fence.lastIndex;
  }
  if (last < source.length) blocks.push({ kind: 'text', content: source.slice(last) });
  return blocks;
}

function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`\n]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <Text key={i} style={styles.bold}>
          {part.slice(2, -2)}
        </Text>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <Text key={i} style={styles.inlineCode}>
          {part.slice(1, -1)}
        </Text>
      );
    }
    return part;
  });
}

export default function MarkdownText({ children }: { children: string }) {
  return (
    <View style={styles.container}>
      {splitBlocks(children).map((block, i) => {
        if (block.kind === 'code') {
          return (
            <View key={i} style={styles.codeBlock}>
              {block.lang ? <Text style={styles.codeLang}>{block.lang}</Text> : null}
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Text selectable style={styles.code}>
                  {block.content}
                </Text>
              </ScrollView>
            </View>
          );
        }
        const text = block.content.replace(/^\n+|\n+$/g, '');
        return text ? (
          <Text key={i} selectable style={styles.text}>
            {renderInline(text)}
          </Text>
        ) : null;
      })}
    </View>
  );
}

const mono = { fontFamily: 'monospace' } as const;

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  text: {
    color: colors.textPrimary,
    fontSize: typography.md,
    lineHeight: 23,
  },
  bold: {
    fontWeight: '700',
  },
  inlineCode: {
    ...mono,
    backgroundColor: colors.surfaceRaised,
    fontSize: typography.sm,
  },
  codeBlock: {
    backgroundColor: colors.codeBackground,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  codeLang: {
    color: colors.textMuted,
    fontSize: typography.xs,
  },
  code: {
    ...mono,
    color: colors.textPrimary,
    fontSize: typography.sm,
    lineHeight: 20,
  },
});
