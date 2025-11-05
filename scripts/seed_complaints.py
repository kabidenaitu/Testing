import json
import os
import sys
from datetime import datetime
from typing import Any, Dict, List

import urllib.request


def iso(timestamp: str) -> str:
    return datetime.fromisoformat(timestamp.replace('Z', '+00:00')).isoformat()


def mutation_url(base_url: str) -> str:
    return base_url.rstrip('/') + '/api/mutation'


def build_payload(complaint: Dict[str, Any]) -> Dict[str, Any]:
    payload = complaint.copy()
    payload.setdefault('analysis', None)
    payload.setdefault('media', [])
    payload.setdefault('status', 'pending')
    return {
        'path': 'complaints:create',
        'args': {
            'payload': payload
        }
    }


def post_json(url: str, data: Dict[str, Any]) -> Dict[str, Any]:
    body = json.dumps(data).encode('utf-8')
    request = urllib.request.Request(
        url,
        data=body,
        headers={
            'Content-Type': 'application/json'
        }
    )
    with urllib.request.urlopen(request, timeout=20) as response:  # nosec B310
        return json.loads(response.read().decode('utf-8'))


def main() -> None:
    base_url = os.getenv('CONVEX_URL')
    if not base_url:
        print('CONVEX_URL is not set. Please export it or add to .env', file=sys.stderr)
        sys.exit(1)

    dataset: List[Dict[str, Any]] = [
        {
            'description': 'Автобус №12 прибыл с опозданием на 20 минут, освещение в салоне не работало.',
            'priority': 'medium',
            'tuples': [
                {
                    'objects': [{'type': 'route', 'value': '12'}],
                    'time': iso('2025-02-01T08:20:00+05:00'),
                    'place': {'kind': 'stop', 'value': 'Остановка «Самал-2»'},
                    'aspects': ['punctuality', 'condition']
                }
            ],
            'analysis': {
                'summary': 'Опоздание маршрута №12 и неисправное освещение.',
                'need_clarification': False
            },
            'isAnonymous': False,
            'contact': {'name': 'Айбек Касымов', 'phone': '+7 705 123 45 67'},
            'source': 'web',
            'submissionTime': iso('2025-02-01T08:45:00+05:00'),
            'reportedTime': iso('2025-02-01T08:20:00+05:00'),
            'status': 'pending'
        },
        {
            'description': 'Водитель маршрута 31 отказался принять оплату картой и разговаривал грубо.',
            'priority': 'high',
            'tuples': [
                {
                    'objects': [
                        {'type': 'route', 'value': '31'},
                        {'type': 'bus_plate', 'value': '123ABZ01'}
                    ],
                    'time': iso('2025-01-28T19:05:00+05:00'),
                    'place': {'kind': 'stop', 'value': 'Остановка «Сарыарка»'},
                    'aspects': ['payment', 'staff']
                }
            ],
            'analysis': {'summary': 'Нарушение правил оплаты и некорректное поведение.', 'need_clarification': False},
            'isAnonymous': True,
            'source': 'telegram',
            'submissionTime': iso('2025-01-28T19:15:00+05:00'),
            'reportedTime': iso('2025-01-28T19:05:00+05:00'),
            'status': 'approved',
            'adminComment': 'Связались с перевозчиком, проведена беседа с водителем.'
        },
        {
            'description': 'На маршруте 7 кондиционер не работает, температура в салоне выше 30 градусов.',
            'priority': 'medium',
            'tuples': [
                {
                    'objects': [{'type': 'route', 'value': '7'}],
                    'time': iso('2025-01-26T14:40:00+05:00'),
                    'place': {'kind': 'street', 'value': 'проспект Туран'},
                    'aspects': ['condition']
                }
            ],
            'analysis': {'summary': 'Неисправный кондиционер, нужна проверка.', 'need_clarification': False},
            'isAnonymous': False,
            'contact': {'name': 'Жанар Абдрахманова', 'email': 'zhanar.abd@example.com'},
            'source': 'web',
            'submissionTime': iso('2025-01-26T15:05:00+05:00'),
            'reportedTime': iso('2025-01-26T14:40:00+05:00'),
            'status': 'resolved',
            'adminComment': 'Кондиционер заменён, измерения температуры в норме.'
        },
        {
            'description': 'Маршрут 10 пропустил остановку «Жастар», пассажиры опоздали на занятия.',
            'priority': 'high',
            'tuples': [
                {
                    'objects': [{'type': 'route', 'value': '10'}],
                    'time': iso('2025-01-30T07:30:00+05:00'),
                    'place': {'kind': 'stop', 'value': 'Остановка «Жастар»'},
                    'aspects': ['punctuality', 'staff']
                }
            ],
            'analysis': {'summary': 'Пропуск остановки водителем.', 'need_clarification': False},
            'isAnonymous': True,
            'source': 'telegram',
            'submissionTime': iso('2025-01-30T07:45:00+05:00'),
            'reportedTime': iso('2025-01-30T07:30:00+05:00'),
            'status': 'approved',
            'adminComment': 'Нарушение подтверждено, назначен контроль инспектора.'
        },
        {
            'description': 'Автобус 52 ехал с открытой дверью, создавая угрозу безопасности.',
            'priority': 'critical',
            'tuples': [
                {
                    'objects': [{'type': 'route', 'value': '52'}],
                    'time': iso('2025-02-02T18:10:00+05:00'),
                    'place': {'kind': 'street', 'value': 'ул. Мәңгілік Ел, 40'},
                    'aspects': ['safety']
                }
            ],
            'analysis': {'summary': 'Серьёзное нарушение безопасности.', 'need_clarification': False},
            'isAnonymous': False,
            'contact': {'name': 'Елена Мирошниченко', 'phone': '+7 707 555 23 11'},
            'source': 'web',
            'submissionTime': iso('2025-02-02T18:25:00+05:00'),
            'reportedTime': iso('2025-02-02T18:10:00+05:00'),
            'status': 'pending'
        },
        {
            'description': 'Маршрут 38 по выходным ходит реже расписания, ожидание более 25 минут.',
            'priority': 'medium',
            'tuples': [
                {
                    'objects': [{'type': 'route', 'value': '38'}],
                    'time': iso('2025-01-25T12:15:00+05:00'),
                    'place': {'kind': 'stop', 'value': 'Остановка «Хан Шатыр»'},
                    'aspects': ['punctuality']
                }
            ],
            'analysis': {'summary': 'Несоблюдение интервала движения.', 'need_clarification': False},
            'isAnonymous': False,
            'contact': {'name': 'Руслан Нурпеис', 'email': 'ruslan.nurpeis@example.com'},
            'source': 'web',
            'submissionTime': iso('2025-01-25T12:35:00+05:00'),
            'reportedTime': iso('2025-01-25T12:15:00+05:00'),
            'status': 'resolved',
            'adminComment': 'Добавлена дополнительная машина в выходные.'
        },
        {
            'description': 'В трамвае T1 не работает оповещение остановок, сложно ориентироваться.',
            'priority': 'low',
            'tuples': [
                {
                    'objects': [{'type': 'route', 'value': 'T1'}],
                    'time': iso('2025-01-24T21:10:00+05:00'),
                    'place': {'kind': 'stop', 'value': 'Станция «Expo»'},
                    'aspects': ['condition', 'other']
                }
            ],
            'analysis': {'summary': 'Нужна настройка аудиоинформатора.', 'need_clarification': False},
            'isAnonymous': True,
            'source': 'telegram',
            'submissionTime': iso('2025-01-24T21:18:00+05:00'),
            'reportedTime': iso('2025-01-24T21:10:00+05:00'),
            'status': 'pending'
        },
        {
            'description': 'Маршрут 47 утром переполнен, двери закрываются, оставляя пассажиров.',
            'priority': 'high',
            'tuples': [
                {
                    'objects': [{'type': 'route', 'value': '47'}],
                    'time': iso('2025-01-27T08:00:00+05:00'),
                    'place': {'kind': 'stop', 'value': 'Остановка «Назарбаев Университет»'},
                    'aspects': ['crowding', 'safety']
                }
            ],
            'analysis': {'summary': 'Переполненность и риски безопасности.', 'need_clarification': False},
            'isAnonymous': False,
            'contact': {'name': 'Мадина Исаева', 'phone': '+7 705 908 43 22'},
            'source': 'web',
            'submissionTime': iso('2025-01-27T08:25:00+05:00'),
            'reportedTime': iso('2025-01-27T08:00:00+05:00'),
            'status': 'approved',
            'adminComment': 'Запланировано усиление смены с 29.01, ведётся мониторинг нагрузки.'
        },
        {
            'description': 'Маршрут 20 вечером пропускает остановку «Жайлау», ситуация повторяется.',
            'priority': 'medium',
            'tuples': [
                {
                    'objects': [{'type': 'route', 'value': '20'}],
                    'time': iso('2025-01-29T22:05:00+05:00'),
                    'place': {'kind': 'stop', 'value': 'Остановка «Жайлау»'},
                    'aspects': ['staff', 'punctuality']
                }
            ],
            'analysis': {'summary': 'Подозрение на нарушение маршрута.', 'need_clarification': False},
            'isAnonymous': False,
            'contact': {'name': 'Серик Ержанов', 'email': 'serik.erzhanov@example.com'},
            'source': 'web',
            'submissionTime': iso('2025-01-29T22:25:00+05:00'),
            'reportedTime': iso('2025-01-29T22:05:00+05:00'),
            'status': 'pending'
        },
        {
            'description': 'Водитель маршрута 5 помог пассажиру с инвалидной коляской, хочу поблагодарить.',
            'priority': 'low',
            'tuples': [
                {
                    'objects': [{'type': 'route', 'value': '5'}],
                    'time': iso('2025-01-23T11:15:00+05:00'),
                    'place': {'kind': 'stop', 'value': 'Остановка «Керуен»'},
                    'aspects': ['staff']
                }
            ],
            'analysis': {'summary': 'Положительный отзыв о работе водителя.', 'need_clarification': False},
            'isAnonymous': False,
            'contact': {'name': 'Светлана Бекжигитова'},
            'source': 'web',
            'submissionTime': iso('2025-01-23T11:25:00+05:00'),
            'reportedTime': iso('2025-01-23T11:15:00+05:00'),
            'status': 'resolved',
            'adminComment': 'Благодарность передана автобусному парку.'
        },
        {
            'description': 'Автобус 15 не открывает переднюю дверь для входа с коляской.',
            'priority': 'high',
            'tuples': [
                {
                    'objects': [{'type': 'route', 'value': '15'}],
                    'time': iso('2025-01-21T09:40:00+05:00'),
                    'place': {'kind': 'stop', 'value': 'Остановка «Абылай хана»'},
                    'aspects': ['staff', 'safety']
                }
            ],
            'analysis': {'summary': 'Нарушение правил посадки.', 'need_clarification': False},
            'isAnonymous': False,
            'contact': {'name': 'Ольга Руденко', 'phone': '+7 777 102 33 44'},
            'source': 'web',
            'submissionTime': iso('2025-01-21T09:55:00+05:00'),
            'reportedTime': iso('2025-01-21T09:40:00+05:00'),
            'status': 'approved',
            'adminComment': 'Провели инструктаж водителей, усилен контроль посадки.'
        },
        {
            'description': 'Маршрут 3 из-за пробки объезжает улицу и не предупреждает заранее.',
            'priority': 'medium',
            'tuples': [
                {
                    'objects': [{'type': 'route', 'value': '3'}],
                    'time': iso('2025-01-31T08:20:00+05:00'),
                    'place': {'kind': 'street', 'value': 'проспект Бейбитшилик'},
                    'aspects': ['staff', 'other']
                }
            ],
            'analysis': {'summary': 'Отклонение от маршрута без оповещения.', 'need_clarification': False},
            'isAnonymous': True,
            'source': 'telegram',
            'submissionTime': iso('2025-01-31T08:28:00+05:00'),
            'reportedTime': iso('2025-01-31T08:20:00+05:00'),
            'status': 'rejected',
            'adminComment': 'Видео подтвердило временное перекрытие, водитель высадил пассажиров заранее.'
        }
    ]

    url = mutation_url(base_url)
    success = 0

    for complaint in dataset:
        payload = build_payload(complaint)
        try:
            response = post_json(url, payload)
            if response.get('status') == 'success':
                success += 1
            else:
                print('Ошибка при добавлении заявки:', response, file=sys.stderr)
        except Exception as exc:  # noqa: BLE001
            print('Исключение при добавлении заявки:', exc, file=sys.stderr)

    print(f'Добавлено обращений: {success}/{len(dataset)}')


if __name__ == '__main__':
    main()
