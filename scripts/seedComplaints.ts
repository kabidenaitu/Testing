import 'dotenv/config';
import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';

type Priority = 'low' | 'medium' | 'high' | 'critical';
type ComplaintStatus = 'pending' | 'approved' | 'resolved' | 'rejected';

interface SeedComplaint {
  description: string;
  priority: Priority;
  tuples: Array<{
    objects: Array<{ type: 'route' | 'bus_plate'; value: string }>;
    time: string;
    place: { kind: 'stop' | 'street' | 'crossroad'; value: string };
    aspects: string[];
  }>;
  analysis?: Record<string, unknown> | null;
  isAnonymous: boolean;
  contact?: {
    name?: string;
    phone?: string;
    email?: string;
  };
  source: 'web' | 'telegram';
  submissionTime: string;
  reportedTime: string;
  status?: ComplaintStatus;
  adminComment?: string;
}

const ISO = (input: string): string => new Date(input).toISOString();

const dataset: SeedComplaint[] = [
  {
    description:
      'Автобус №12 прибыл с опозданием почти на 20 минут, из-за чего я опоздал на работу. В салоне было темно, освещение не работало.',
    priority: 'medium',
    tuples: [
      {
        objects: [{ type: 'route', value: '12' }],
        time: ISO('2025-02-01T08:20:00+05:00'),
        place: { kind: 'stop', value: 'Остановка «Самал-2»' },
        aspects: ['punctuality', 'condition']
      }
    ],
    analysis: {
      summary: 'Опоздание маршрута №12 и неисправное освещение в салоне.',
      need_clarification: false
    },
    isAnonymous: false,
    contact: {
      name: 'Айбек Касымов',
      phone: '+7 705 123 45 67'
    },
    source: 'web',
    submissionTime: ISO('2025-02-01T08:45:00+05:00'),
    reportedTime: ISO('2025-02-01T08:20:00+05:00'),
    status: 'pending'
  },
  {
    description:
      'Водитель маршрута 31 отказался принять оплату картой, требовал только наличные и грубо разговаривал.',
    priority: 'high',
    tuples: [
      {
        objects: [
          { type: 'route', value: '31' },
          { type: 'bus_plate', value: '123ABZ01' }
        ],
        time: ISO('2025-01-28T19:05:00+05:00'),
        place: { kind: 'stop', value: 'Остановка «Сарыарка»' },
        aspects: ['payment', 'staff']
      }
    ],
    analysis: {
      summary: 'Нарушение правил оплаты и некорректное поведение водителя.',
      need_clarification: false
    },
    isAnonymous: true,
    source: 'telegram',
    submissionTime: ISO('2025-01-28T19:15:00+05:00'),
    reportedTime: ISO('2025-01-28T19:05:00+05:00'),
    status: 'approved',
    adminComment:
      'Связались с подрядчиком маршрута №31, проведена беседа с водителем. Контроль повторных нарушений в течение недели.'
  },
  {
    description:
      'На маршруте 7 кондиционер в салоне не работал, температура была выше 30 градусов. Пассажиры жаловались на духоту.',
    priority: 'medium',
    tuples: [
      {
        objects: [{ type: 'route', value: '7' }],
        time: ISO('2025-01-26T14:40:00+05:00'),
        place: { kind: 'street', value: 'проспект Туран' },
        aspects: ['condition']
      }
    ],
    analysis: {
      summary: 'Неисправный кондиционер, требуется техническая проверка.',
      need_clarification: false
    },
    isAnonymous: false,
    contact: {
      name: 'Жанар Абдрахманова',
      email: 'zhanar.abd@example.com'
    },
    source: 'web',
    submissionTime: ISO('2025-01-26T15:05:00+05:00'),
    reportedTime: ISO('2025-01-26T14:40:00+05:00'),
    status: 'resolved',
    adminComment: 'Подрядчик заменил кондиционер 27.01. Проверка температуры показала норму.'
  },
  {
    description:
      'Утром на остановке «Жастар» маршрут 10 не остановился, хотя люди махали рукой. В результате опоздали на занятия.',
    priority: 'high',
    tuples: [
      {
        objects: [{ type: 'route', value: '10' }],
        time: ISO('2025-01-30T07:30:00+05:00'),
        place: { kind: 'stop', value: 'Остановка «Жастар»' },
        aspects: ['punctuality', 'staff']
      }
    ],
    analysis: {
      summary: 'Пропуск остановки водителем, требуется профилактика.',
      need_clarification: false
    },
    isAnonymous: true,
    source: 'telegram',
    submissionTime: ISO('2025-01-30T07:45:00+05:00'),
    reportedTime: ISO('2025-01-30T07:30:00+05:00'),
    status: 'approved',
    adminComment: 'Проведена беседа с водителем. Видеорегистратор подтвердил нарушение. Контроль через дорожный инспектор.'
  },
  {
    description:
      'Автобус маршрута 52 ехал с открытой дверью, что создаёт опасность выпадения пассажиров. Прошу принять меры.',
    priority: 'critical',
    tuples: [
      {
        objects: [{ type: 'route', value: '52' }],
        time: ISO('2025-02-02T18:10:00+05:00'),
        place: { kind: 'street', value: 'ул. Мәңгілік Ел, 40' },
        aspects: ['safety']
      }
    ],
    analysis: {
      summary: 'Серьёзное нарушение безопасности. Требуется немедленная реакция.',
      need_clarification: false
    },
    isAnonymous: false,
    contact: {
      name: 'Елена Мирошниченко',
      phone: '+7 707 555 23 11'
    },
    source: 'web',
    submissionTime: ISO('2025-02-02T18:25:00+05:00'),
    reportedTime: ISO('2025-02-02T18:10:00+05:00'),
    status: 'pending'
  },
  {
    description:
      'Маршрут 38 в выходные дни ходит реже расписания — ожидание более 25 минут. В расписании на сайте указано каждые 12 минут.',
    priority: 'medium',
    tuples: [
      {
        objects: [{ type: 'route', value: '38' }],
        time: ISO('2025-01-25T12:15:00+05:00'),
        place: { kind: 'stop', value: 'Остановка «Хан Шатыр»' },
        aspects: ['punctuality']
      }
    ],
    analysis: {
      summary: 'Несоблюдение интервала движения маршрута в выходные.',
      need_clarification: false
    },
    isAnonymous: false,
    contact: {
      name: 'Руслан Нурпеис',
      email: 'ruslan.nurpeis@example.com'
    },
    source: 'web',
    submissionTime: ISO('2025-01-25T12:35:00+05:00'),
    reportedTime: ISO('2025-01-25T12:15:00+05:00'),
    status: 'resolved',
    adminComment: 'Маршрут усилили дополнительной машиной в выходные. Мониторим жалобы повторно.'
  },
  {
    description:
      'В трамвае Т1 не работает оповещение остановок, сложно ориентироваться вечером. Прошу наладить систему объявлений.',
    priority: 'low',
    tuples: [
      {
        objects: [{ type: 'route', value: 'T1' }],
        time: ISO('2025-01-24T21:10:00+05:00'),
        place: { kind: 'stop', value: 'Станция «Expo»' },
        aspects: ['condition', 'other']
      }
    ],
    analysis: {
      summary: 'Не работает аудиоинформатор, требуется настройка.',
      need_clarification: false
    },
    isAnonymous: true,
    source: 'telegram',
    submissionTime: ISO('2025-01-24T21:18:00+05:00'),
    reportedTime: ISO('2025-01-24T21:10:00+05:00'),
    status: 'pending'
  },
  {
    description:
      'Маршрут 47 утром всегда переполнен, людей не помещается и автобус уезжает с закрытыми дверями, оставляя пассажиров.',
    priority: 'high',
    tuples: [
      {
        objects: [{ type: 'route', value: '47' }],
        time: ISO('2025-01-27T08:00:00+05:00'),
        place: { kind: 'stop', value: 'Остановка «Назарбаев Университет»' },
        aspects: ['crowding', 'safety']
      }
    ],
    analysis: {
      summary: 'Переполненность и нарушения безопасности.',
      need_clarification: false
    },
    isAnonymous: false,
    contact: {
      name: 'Мадина Исаева',
      phone: '+7 705 908 43 22'
    },
    source: 'web',
    submissionTime: ISO('2025-01-27T08:25:00+05:00'),
    reportedTime: ISO('2025-01-27T08:00:00+05:00'),
    status: 'approved',
    adminComment: 'Усиление смены в час пик запланировано с 29.01. Следим за загрузкой через датчики.'
  },
  {
    description:
      'Маршрут 20 вечером пропускает остановку «Жайлау». Возможно, водитель сокращает маршрут. Ситуация повторяется третий день.',
    priority: 'medium',
    tuples: [
      {
        objects: [{ type: 'route', value: '20' }],
        time: ISO('2025-01-29T22:05:00+05:00'),
        place: { kind: 'stop', value: 'Остановка «Жайлау»' },
        aspects: ['staff', 'punctuality']
      }
    ],
    analysis: {
      summary: 'Подозрение на нарушение маршрута водителем.',
      need_clarification: false
    },
    isAnonymous: false,
    contact: {
      name: 'Серик Ержанов',
      email: 'serik.erzhanov@example.com'
    },
    source: 'web',
    submissionTime: ISO('2025-01-29T22:25:00+05:00'),
    reportedTime: ISO('2025-01-29T22:05:00+05:00'),
    status: 'pending'
  },
  {
    description:
      'Водитель маршрута 5 помог снять инвалидную коляску и дождался, пока пассажир расположится. Хочу поблагодарить за сервис.',
    priority: 'low',
    tuples: [
      {
        objects: [{ type: 'route', value: '5' }],
        time: ISO('2025-01-23T11:15:00+05:00'),
        place: { kind: 'stop', value: 'Остановка «Керуен»' },
        aspects: ['staff']
      }
    ],
    analysis: {
      summary: 'Положительный отзыв о работе водителя.',
      need_clarification: false
    },
    isAnonymous: false,
    contact: {
      name: 'Светлана Бекжигитова'
    },
    source: 'web',
    submissionTime: ISO('2025-01-23T11:25:00+05:00'),
    reportedTime: ISO('2025-01-23T11:15:00+05:00'),
    status: 'resolved',
    adminComment: 'Передали благодарность в автобусный парк. Водителю объявлена благодарность.'
  },
  {
    description:
      'На остановке «Абылай хана» автобус 15 не открывает переднюю дверь для входа с коляской. Приходится просить прохожих помочь.',
    priority: 'high',
    tuples: [
      {
        objects: [{ type: 'route', value: '15' }],
        time: ISO('2025-01-21T09:40:00+05:00'),
        place: { kind: 'stop', value: 'Остановка «Абылай хана»' },
        aspects: ['staff', 'safety']
      }
    ],
    analysis: {
      summary: 'Нарушение правил посадки для людей с коляской.',
      need_clarification: false
    },
    isAnonymous: false,
    contact: {
      name: 'Ольга Руденко',
      phone: '+7 777 102 33 44'
    },
    source: 'web',
    submissionTime: ISO('2025-01-21T09:55:00+05:00'),
    reportedTime: ISO('2025-01-21T09:40:00+05:00'),
    status: 'approved',
    adminComment: 'Парк получил предписание усилить контроль. Организовали дополнительный инструктаж для водителей.'
  },
  {
    description:
      'Маршрут 3 утром на левом берегу объезжает часть улицы из-за пробки, но не предупреждает пассажиров, что нужно выйти раньше.',
    priority: 'medium',
    tuples: [
      {
        objects: [{ type: 'route', value: '3' }],
        time: ISO('2025-01-31T08:20:00+05:00'),
        place: { kind: 'street', value: 'проспект Бейбитшилик' },
        aspects: ['staff', 'other']
      }
    ],
    analysis: {
      summary: 'Отклонение от маршрута без оповещения пассажиров.',
      need_clarification: false
    },
    isAnonymous: true,
    source: 'telegram',
    submissionTime: ISO('2025-01-31T08:28:00+05:00'),
    reportedTime: ISO('2025-01-31T08:20:00+05:00'),
    status: 'rejected',
    adminComment:
      'Видеорегистратор показал временное перекрытие улицы, водитель высадил пассажиров заранее. Жалоба не подтверждена.'
  }
];

async function main() {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) {
    console.error('Переменная CONVEX_URL не задана. Укажите URL Convex в .env.');
    process.exit(1);
  }

  const client = new ConvexHttpClient(convexUrl, { skipConvexDeploymentUrlCheck: true });

  let inserted = 0;
  for (const complaint of dataset) {
    try {
      await client.mutation(anyApi.complaints.create, {
        payload: {
          description: complaint.description,
          priority: complaint.priority,
          tuples: complaint.tuples,
          analysis: complaint.analysis ?? null,
          media: [],
          isAnonymous: complaint.isAnonymous,
          contact: complaint.contact,
          source: complaint.source,
          submissionTime: complaint.submissionTime,
          reportedTime: complaint.reportedTime,
          status: complaint.status,
          adminComment: complaint.adminComment
        }
      });
      inserted += 1;
    } catch (error) {
      console.error('Не удалось сохранить жалобу:', error);
    }
  }

  console.log(`Добавлено жалоб: ${inserted}/${dataset.length}`);
}

main().catch((error) => {
  console.error('Ошибка при выполнении скрипта:', error);
  process.exit(1);
});
