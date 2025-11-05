import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'kz' | 'ru';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations = {
  kz: {
    // Header
    'header.title': 'Қоғамдық көлік шағымдары',
    'header.admin': 'Әкімші панелі',
    'header.largeText': 'Ірі мәтін',
    
    // Hero
    'hero.title': 'Астана қоғамдық көлігі бойынша шағым жіберу',
    'hero.description': 'Біз сіздің шағымыңызды талдап, жауапты қызметтерге жолдаймыз',
    'hero.submitButton': 'Шағым жіберу',
    
    // Wizard Steps
    'wizard.step1': 'Сипаттама',
    'wizard.step2': 'Нақтылау',
    'wizard.step3': 'Қарап шығу',
    'wizard.step4': 'Растау',
    
    // Step 1
    'step1.description': 'Жағдайды еркін түрде сипаттаңыз',
    'step1.placeholder': 'Не болды? Қай маршрут, қай уақытта, қандай мәселе?',
    'step1.analyze': 'Талдау',
    'step1.uploadMedia': 'Медиа қосу',
    'step1.anonymous': 'Анонимді жіберу',
    'step1.contactName': 'Аты-жөні',
    'step1.contactPhone': 'Телефон',
    'step1.contactEmail': 'Email',
    
    // Step 2
    'step2.title': 'Нақтылау',
    'step2.description': 'Шағымды толық өңдеу үшін бірнеше сұрақтарға жауап беріңіз',
    'step2.placeholder': 'Жауабыңызды енгізіңіз...',
    'step2.complete': 'Барлық сұрақтарға жауап берілді!',
    'step2.clarifying': 'Нақтылау сұрақтары',
    'step2.answerPlaceholder': 'Жауабыңызды жазыңыз...',
    
    // Step 3
    'step3.preview': 'Шағымды қарап шығу',
    'step3.priority': 'Басымдық',
    'step3.route': 'Маршрут',
    'step3.plate': 'Мемлекеттік нөмір',
    'step3.location': 'Орын',
    'step3.time': 'Уақыт',
    'step3.aspect': 'Аспект',
    'step3.recommendation': 'Ұсыныс',
    'step3.edit': 'Өңдеу',
    'step3.submit': 'Жіберу',
    'step3.back': 'Артқа',
    'step3.descriptionLabel': 'Сипаттама',
    'step3.details': 'Деректер',
    'step3.media': 'Медиа',
    'step3.contact': 'Байланыс',
    'step3.contactNameLabel': 'Аты',
    'step3.contactPhoneLabel': 'Телефон',
    'step3.contactEmailLabel': 'Email',
    'step3.defaultRecommendation': 'Шағым тіркелді және талдау үстінде',
    
    // Step 4
    'step4.success': 'Шағым қабылданды!',
    'step4.referenceNumber': 'Өтініш нөмірі',
    'step4.newComplaint': 'Жаңа шағым',
    'step4.processing': 'Шағымыңыз қабылданды және қаралуда',
    
    // Priority
    'priority.all': 'Барлығы',
    'priority.low': 'Төмен',
    'priority.medium': 'Орташа',
    'priority.high': 'Жоғары',
    'priority.critical': 'Өте маңызды',
    
    // Admin
    'admin.title': 'Әкімші панелі',
    'admin.filters': 'Сүзгілер',
    'admin.dateRange': 'Кезең',
    'admin.priorityLabel': 'Басымдық',
    'admin.statusLabel': 'Статус',
    'admin.export': 'Экспорт',
    'admin.complaints': 'Шағымдар',
    'admin.status.all': 'Барлығы',
    'admin.status.new': 'Жаңа',
    'admin.status.inProgress': 'Қаралуда',
    'admin.status.closed': 'Жабылды',
    'admin.table.id': 'ID',
    'admin.table.priority': 'Басымдық',
    'admin.table.route': 'Маршрут',
    'admin.table.time': 'Уақыт',
    'admin.table.status': 'Статус',
    'admin.table.empty': 'Көрсетілетін дерек жоқ',
    'admin.cards.routes': 'Мәселе бар маршруттар',
    'admin.cards.priorityDistribution': 'Деңгейлер бойынша бөліну',
    'admin.cards.aspectFrequency': 'Аспектілер жиілігі',
    'admin.cards.heatmap': 'Сағаттар бойынша жылу картасы',
    
    // Footer
    'footer.about': 'Жоба туралы',
    'footer.privacy': 'Құпиялылық саясаты',

    // Errors
    'errors.title': 'Қате',
    'errors.describeSituation': 'Өтінеміз, жағдайды сипаттаңыз',
    'errors.analyzeFailed': 'Шағымды талдау мүмкін болмады',
    'errors.submitFailed': 'Шағымды жіберу мүмкін болмады',

    // File upload
    'fileUpload.dragDrop': 'Файлдарды тартып әкеліңіз немесе таңдаңыз',
    'fileUpload.limits': 'Фото ≤10 МБ, Видео/Аудио ≤30 МБ',
    'fileUpload.select': 'Файлды таңдау',
    'fileUpload.tooLarge': 'көлемі тым үлкен',

    // Charts
    'charts.days.mon': 'Дс',
    'charts.days.tue': 'Сс',
    'charts.days.wed': 'Ср',
    'charts.days.thu': 'Бс',
    'charts.days.fri': 'Жм',
    'charts.days.sat': 'Сб',
    'charts.days.sun': 'Жс',
    'charts.heatmap.tooltip': 'Шағымдар',
    'charts.aspects.driverConduct': 'Жүргізушінің мәдениетсіздігі',
    'charts.aspects.delay': 'Кешігу',
    'charts.aspects.cleanliness': 'Тазалық',
    'charts.aspects.technical': 'Техникалық ақау',
    'charts.aspects.routeChange': 'Маршрут өзгерісі',
  },
  ru: {
    // Header
    'header.title': 'Жалобы на общественный транспорт',
    'header.admin': 'Админ-панель',
    'header.largeText': 'Крупный текст',
    
    // Hero
    'hero.title': 'Подача жалобы на общественный транспорт Астаны',
    'hero.description': 'Мы проанализируем вашу жалобу и направим её в ответственные службы',
    'hero.submitButton': 'Подать жалобу',
    
    // Wizard Steps
    'wizard.step1': 'Описание',
    'wizard.step2': 'Уточнение',
    'wizard.step3': 'Просмотр',
    'wizard.step4': 'Подтверждение',
    
    // Step 1
    'step1.description': 'Опишите ситуацию свободно',
    'step1.placeholder': 'Что произошло? Какой маршрут, когда, какая проблема?',
    'step1.analyze': 'Анализ',
    'step1.uploadMedia': 'Добавить медиа',
    'step1.anonymous': 'Отправить анонимно',
    'step1.contactName': 'Имя',
    'step1.contactPhone': 'Телефон',
    'step1.contactEmail': 'Email',
    
    // Step 2
    'step2.title': 'Уточнение',
    'step2.description': 'Ответьте на несколько вопросов для полной обработки жалобы',
    'step2.placeholder': 'Введите ваш ответ...',
    'step2.complete': 'Все вопросы отвечены!',
    'step2.clarifying': 'Уточняющие вопросы',
    'step2.answerPlaceholder': 'Введите ваш ответ...',
    
    // Step 3
    'step3.preview': 'Предпросмотр жалобы',
    'step3.priority': 'Приоритет',
    'step3.route': 'Маршрут',
    'step3.plate': 'Гос. номер',
    'step3.location': 'Место',
    'step3.time': 'Время',
    'step3.aspect': 'Аспект',
    'step3.recommendation': 'Рекомендация',
    'step3.edit': 'Редактировать',
    'step3.submit': 'Отправить',
    'step3.back': 'Назад',
    'step3.descriptionLabel': 'Описание',
    'step3.details': 'Данные',
    'step3.media': 'Медиа',
    'step3.contact': 'Контакты',
    'step3.contactNameLabel': 'Имя',
    'step3.contactPhoneLabel': 'Телефон',
    'step3.contactEmailLabel': 'Email',
    'step3.defaultRecommendation': 'Жалоба зарегистрирована и анализируется',
    
    // Step 4
    'step4.success': 'Жалоба принята!',
    'step4.referenceNumber': 'Номер обращения',
    'step4.newComplaint': 'Новая жалоба',
    'step4.processing': 'Ваша жалоба принята и находится в обработке',
    
    // Priority
    'priority.all': 'Все',
    'priority.low': 'Низкий',
    'priority.medium': 'Средний',
    'priority.high': 'Высокий',
    'priority.critical': 'Критический',
    
    // Admin
    'admin.title': 'Панель администратора',
    'admin.filters': 'Фильтры',
    'admin.dateRange': 'Период',
    'admin.priorityLabel': 'Приоритет',
    'admin.statusLabel': 'Статус',
    'admin.export': 'Экспорт',
    'admin.complaints': 'Жалобы',
    'admin.status.all': 'Все',
    'admin.status.new': 'Новые',
    'admin.status.inProgress': 'В работе',
    'admin.status.closed': 'Закрыто',
    'admin.table.id': 'ID',
    'admin.table.priority': 'Приоритет',
    'admin.table.route': 'Маршрут',
    'admin.table.time': 'Время',
    'admin.table.status': 'Статус',
    'admin.table.empty': 'Нет данных для отображения',
    'admin.cards.routes': 'Проблемные маршруты',
    'admin.cards.priorityDistribution': 'Распределение по уровням',
    'admin.cards.aspectFrequency': 'Частота аспектов',
    'admin.cards.heatmap': 'Тепловая карта по часам',
    
    // Footer
    'footer.about': 'О проекте',
    'footer.privacy': 'Политика конфиденциальности',

    // Errors
    'errors.title': 'Ошибка',
    'errors.describeSituation': 'Пожалуйста, опишите ситуацию',
    'errors.analyzeFailed': 'Не удалось проанализировать жалобу',
    'errors.submitFailed': 'Не удалось отправить жалобу',

    // File upload
    'fileUpload.dragDrop': 'Перетащите или выберите файлы',
    'fileUpload.limits': 'Фото ≤10 МБ, Видео/Аудио ≤30 МБ',
    'fileUpload.select': 'Выбрать файл',
    'fileUpload.tooLarge': 'слишком большой',

    // Charts
    'charts.days.mon': 'Пн',
    'charts.days.tue': 'Вт',
    'charts.days.wed': 'Ср',
    'charts.days.thu': 'Чт',
    'charts.days.fri': 'Пт',
    'charts.days.sat': 'Сб',
    'charts.days.sun': 'Вс',
    'charts.heatmap.tooltip': 'Жалобы',
    'charts.aspects.driverConduct': 'Некорректное поведение водителя',
    'charts.aspects.delay': 'Опоздание',
    'charts.aspects.cleanliness': 'Чистота',
    'charts.aspects.technical': 'Техническая неисправность',
    'charts.aspects.routeChange': 'Изменение маршрута',
  },
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>('kz');

  useEffect(() => {
    const savedLang = localStorage.getItem('language') as Language;
    if (savedLang && (savedLang === 'kz' || savedLang === 'ru')) {
      setLanguageState(savedLang);
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('language', lang);
  };

  const t = (key: string): string => {
    return translations[language][key as keyof typeof translations['kz']] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
};
