import { useParams } from 'react-router'
import { PageContainer } from '@/components/app/PageContainer.tsx'
import { PageHeader } from '@/components/app/PageHeader.tsx'
import { parseWordParam } from '@/app/word-path.ts'
import { decodeWordId } from '@/learning/skills/skill-id.ts'

/**
 * Stub — the real senses/paradigm view (`features/word-detail`) is a later task. Still wires
 * up `:wordId` decoding for real (via `parseWordParam` + `decodeWordId`) so the routing
 * contract this task owns is actually exercised end-to-end, not just declared.
 */
export function WordDetailPage() {
  const { wordId: rawWordId } = useParams<{ wordId: string }>()

  let title = 'Слово не найдено'
  let description = 'Некорректный или отсутствующий идентификатор слова в адресе.'
  if (rawWordId) {
    try {
      const wordId = parseWordParam(rawWordId)
      const { lemma, pos } = decodeWordId(wordId)
      title = lemma
      description = `Часть речи: ${pos}. Карточка слова — задача 07+.`
    } catch {
      // Keep the not-found copy above — a malformed :wordId is a routing edge case, not a
      // crash (real error handling for "unknown word" lands with the feature in a later task).
    }
  }

  return (
    <PageContainer>
      <PageHeader title={title} description={description} />
    </PageContainer>
  )
}

export default WordDetailPage
