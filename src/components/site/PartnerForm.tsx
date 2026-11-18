"use client";
import { useState } from "react";

export function PartnerForm({ email }: { email: string }) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [kind, setKind] = useState("Веб-разработчик");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = [`Имя: ${name}`, `Контакт: ${contact}`, `Кто вы: ${kind}`, "", message].join("\n");
    const href = `mailto:${email}?subject=${encodeURIComponent("Партнёрство QRonus")}&body=${encodeURIComponent(body.slice(0, 1500))}`;
    setSent(true);
    window.location.href = href;
  };

  return (
    <form onSubmit={submit} className="card space-y-4" aria-label="Заявка партнёра">
      <div>
        <label className="label" htmlFor="pf-name">Имя</label>
        <input id="pf-name" className="input" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </div>
      <div>
        <label className="label" htmlFor="pf-contact">Email или Telegram</label>
        <input id="pf-contact" className="input" required maxLength={120} value={contact} onChange={(e) => setContact(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="pf-kind">Кто вы</label>
        <select id="pf-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option>Веб-разработчик</option>
          <option>Специалист по автоматизации</option>
          <option>Консультант для малого бизнеса</option>
          <option>Другое</option>
        </select>
      </div>
      <div>
        <label className="label" htmlFor="pf-msg">Расскажите о себе и клиентах</label>
        <textarea id="pf-msg" className="input min-h-28" required maxLength={1000} value={message} onChange={(e) => setMessage(e.target.value)} />
      </div>
      <button type="submit" className="btn-primary w-full sm:w-auto">Написать письмо</button>
      <p className="text-xs leading-relaxed text-muted">
        Кнопка откроет письмо в вашей почтовой программе: данные уходят напрямую на {email}, а не через сайт.
        {sent && <> Если письмо не открылось, напишите нам на <a className="text-neon underline" href={`mailto:${email}`}>{email}</a>.</>}
      </p>
    </form>
  );
}
