/**
 * SAGI ASSISTANT - Finansal Yorum Motoru v2
 */

/* global Core, App */
'use strict';

window.SAGIAssistant = (function () {

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function _buildInsightText(ctx) {
    const { totalInc, totalExp, net, savingsRate, allTx, months, period, fmt,
            prevMonthInc, prevMonthExp, recurring } = ctx;

    const messages = [];
    const tags = [];

    if (!allTx.length) {
      return {
        text: 'Henüz işlem kaydı bulunamadı. İşlem ekledikçe finansal tablonuz burada canlanacak.',
        tags: []
      };
    }

    if (savingsRate >= 40) {
      messages.push(pick([
        `Finansal acıdan harika bir performans sergiliyorsunuz — gelirinizin <strong>%${savingsRate.toFixed(0)}'ini</strong> biriktiriyorsunuz. Bu oran pek cok finansal danismanin onerdigi %20'nin iki kati.`,
        `Gelirinizin <strong>%${savingsRate.toFixed(0)}'ini</strong> birikim olarak kenara koyuyorsunuz — bu gercekten etkileyici bir oran. Birkac ayda bir bu birikimi bir hedef fonuna aktarmayi dusunebilirsiniz.`,
        `Tasarruf oraniniz <strong>%${savingsRate.toFixed(0)}</strong> ile ust segment finansal planlama bandinda. Bu tempoda yillik net birikim potansiyeliniz ${fmt(totalInc * (savingsRate / 100) * 12)}'ye ulasabilir.`
      ]));
      tags.push({ label: 'Tasarruf Lideri', cls: 'success' });

    } else if (savingsRate >= 20) {
      messages.push(pick([
        `Gelirinizin <strong>%${savingsRate.toFixed(0)}'ini</strong> biriktiriyorsunuz — finansal uzmanlarin onerdigi %20 hedefini yakalamissiniz, tebrikler!`,
        `Dengeli bir finansal resim var: harcamalariniz kontrol altinda ve <strong>%${savingsRate.toFixed(0)}</strong> tasarruf oraniyla iyi bir yoldasiniz.`,
        `<strong>%${savingsRate.toFixed(0)}</strong> tasarruf orani makul bir finansal saglik gostergesi. Kucuk ayarlamalarla bu orani daha da yukari tasiyabilirsiniz.`
      ]));
      tags.push({ label: 'Dengeli', cls: 'success' });

    } else if (savingsRate >= 5) {
      messages.push(pick([
        `Gelirinizin yalnizca <strong>%${savingsRate.toFixed(0)}'i</strong> birikim olarak kaliyor. Giderlerinizi biraz daha kismak buyuk fark yaratabilir — kucuk adimlar buyuk kazanimlara donusur.`,
        `Birikim oraniniz <strong>%${savingsRate.toFixed(0)}</strong> duzeyinde. 50/30/20 kuralini uygulamak — gelirin %50'si ihtiyaclar, %30'u istekler, %20'si tasarruf — finansal dengenizi guclendirebilir.`,
        `Gelir-gider makasini acmak icin en kolay yol sabit giderleri sorgulamak. Su an <strong>%${savingsRate.toFixed(0)}</strong> biriktiriyorsunuz; bu orani %15'e cikarmak aylik ${fmt((totalInc * 0.15) - (totalInc * savingsRate / 100))} ek birikim demek.`
      ]));
      tags.push({ label: 'Dikkat', cls: 'warn' });

    } else if (savingsRate >= 0) {
      messages.push(pick([
        `Gelirinizin neredeyse tamami giderlere gidiyor — <strong>%${savingsRate.toFixed(0)}</strong> birikim oraniyla dar bir dengede yuruyorsunuz. En buyuk 3 harcama kategorinizi gozden gecirmenizi oneririm.`,
        `Finansal tamponunuz cok ince — beklenmedik bir gider dengeyi bozabilir. Kucuk de olsa bir acil fon olusturmak oncelikli hedefiniz olabilir.`
      ]));
      tags.push({ label: 'Dikkat', cls: 'warn' });

    } else {
      messages.push(pick([
        `Giderleriniz gelirinizi <strong>${fmt(Math.abs(net))}</strong> asiyor. Bu durum surdurulurse borc sarmalina girebilir — once hangi harcamalari kisabileceginize bakmanizi oneririm.`,
        `Butcenizde <strong>${fmt(Math.abs(net))}</strong> acik var. Sabit giderler (kira, abonelikler) ve degisken giderleri ayristirmak bu acigi kapatmanin ilk adimi olabilir.`
      ]));
      tags.push({ label: 'Acik Var', cls: 'danger' });
    }

    const expTx = allTx.filter(t => t.type === 'expense');
    const catTotals = {};
    expTx.forEach(t => { catTotals[t.cat] = (catTotals[t.cat] || 0) + _toMain(t); });
    const topCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);

    if (topCats.length >= 1 && totalExp > 0) {
      const top = topCats[0];
      const topPct = ((top[1] / totalExp) * 100).toFixed(0);
      if (topPct > 45) {
        messages.push(pick([
          `<strong>${top[0]}</strong> harcamalariniz toplam giderinizin <strong>%${topPct}'ini</strong> olusturuyor — bu yuksek konsantrasyon dikkat gerektiriyor.`,
          `Giderlerinizin neredeyse yarisi tek kategoride: <strong>${top[0]}</strong>. Bu kategoriyi optimize etmek finansal tablonuzu hizla iyilestirebilir.`
        ]));
      } else if (topCats.length >= 2) {
        const top2 = topCats[1];
        messages.push(pick([
          `En buyuk iki harcama kategoriniz <strong>${top[0]}</strong> (%${topPct}) ve <strong>${top2[0]}</strong> (%${((top2[1] / totalExp) * 100).toFixed(0)}).`,
          `Gider dagiliminiza bakildiginda <strong>${top[0]}</strong> one cikiyor. Bu kategoriyi %10 azaltmak aylik ${fmt(top[1] * 0.1)} tasarruf demek.`
        ]));
      }
    }

    if (months.length >= 3) {
      const last3 = months.slice(-3);
      const expTrend = last3[2].exp - last3[0].exp;
      const expPct = Math.abs(expTrend / (last3[0].exp || 1) * 100).toFixed(0);
      if (Math.abs(expTrend) > 0) {
        if (expTrend > 0) {
          messages.push(`Son 3 ayda giderlerinizde <strong>%${expPct} artis</strong> egilimi var — bu momentumun devam etmesi durumunda butcenizi revize etmeniz gerekebilir.`);
          tags.push({ label: 'Gider Artiyor', cls: 'danger' });
        } else {
          messages.push(`Son 3 ayda giderlerinizi <strong>%${expPct} azaltmayi</strong> basardiniz — bu olumlu bir kirilma noktasi!`);
          tags.push({ label: 'Gider Dusuyor', cls: 'success' });
        }
      }
    }

    if (period === 1 && prevMonthExp > 0) {
      const diff = totalExp - prevMonthExp;
      const diffPct = ((diff / prevMonthExp) * 100).toFixed(0);
      if (Math.abs(diff) > prevMonthExp * 0.05) {
        if (diff > 0) {
          messages.push(`Bu ay gecen aya kiyasla <strong>%${diffPct} daha fazla</strong> harcama yaptiniz (${fmt(Math.abs(diff))} fark).`);
        } else {
          messages.push(`Bu ay gecen aya kiyasla <strong>%${Math.abs(diffPct)} daha az</strong> harcadiniz — ${fmt(Math.abs(diff))} tasarruf ettiniz!`);
          tags.push({ label: 'Bu Ay Daha Az', cls: 'success' });
        }
      }
    }

    if (recurring && recurring.length > 0) {
      const recTotal = recurring.reduce((s, r) => {
        const cur = r.currency || ctx.currency;
        return s + _convertToMain(r.amount || 0, cur, ctx.currency);
      }, 0);
      const recPct = totalExp > 0 ? ((recTotal / totalExp) * 100).toFixed(0) : 0;
      if (recPct > 30) {
        messages.push(`Sabit giderleriniz (${recurring.length} abonelik) toplam harcamanizin <strong>%${recPct}'ini</strong> olusturuyor — kullanmadiginiz abonelikleri gozden gecirin.`);
      }
    }

    return { text: messages.join(' '), tags };
  }

  function _buildMonthlyCards(ctx) {
    const { months, fmt } = ctx;
    if (!months || months.length < 2) return '';

    const cards = months.map((m, i) => {
      const net = m.inc - m.exp;
      const sr = m.inc > 0 ? ((net / m.inc) * 100).toFixed(0) : 0;
      const isPositive = net >= 0;
      const netColor = isPositive ? 'var(--status-success)' : 'var(--status-danger)';
      const srColor = sr >= 20 ? 'var(--status-success)' : sr >= 5 ? 'var(--status-warn)' : 'var(--status-danger)';

      const isLast = i === months.length - 1;
      const borderStyle = isLast ? 'border-color:var(--brand-accent);' : '';

      let changeHtml = '';
      if (i > 0) {
        const prev = months[i - 1];
        const expDiff = m.exp - prev.exp;
        const expDiffPct = prev.exp > 0 ? ((expDiff / prev.exp) * 100).toFixed(0) : 0;
        if (Math.abs(expDiff) > 0) {
          const arrow = expDiff > 0 ? '↑' : '↓';
          const cls = expDiff > 0 ? 'color:var(--status-danger)' : 'color:var(--status-success)';
          changeHtml = `<div style="font-size:11px;font-weight:700;${cls};margin-top:4px">${arrow} Gider %${Math.abs(expDiffPct)}</div>`;
        }
      }

      return `
        <div style="min-width:130px;flex:1;background:var(--bg-surface);border:1.5px solid var(--border-light);${borderStyle}border-radius:var(--radius-md);padding:14px;position:relative;overflow:hidden;">
          ${isLast ? `<div style="position:absolute;top:8px;right:8px;font-size:9px;font-weight:800;background:var(--brand-accent);color:#fff;padding:2px 7px;border-radius:99px;letter-spacing:.04em">BU AY</div>` : ''}
          <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">${m.label}</div>

          <div style="font-size:11px;color:var(--text-muted);font-weight:600;margin-bottom:2px">Gelir</div>
          <div style="font-family:var(--font-display);font-size:14px;font-weight:800;color:var(--status-success);letter-spacing:-.02em;margin-bottom:8px">${fmt(m.inc)}</div>

          <div style="font-size:11px;color:var(--text-muted);font-weight:600;margin-bottom:2px">Gider</div>
          <div style="font-family:var(--font-display);font-size:14px;font-weight:800;color:var(--status-danger);letter-spacing:-.02em;margin-bottom:8px">${fmt(m.exp)}</div>

          <div style="height:1px;background:var(--border-light);margin-bottom:8px"></div>

          <div style="font-size:11px;color:var(--text-muted);font-weight:600;margin-bottom:2px">Net</div>
          <div style="font-family:var(--font-display);font-size:15px;font-weight:800;color:${netColor};letter-spacing:-.02em">${isPositive ? '+' : ''}${fmt(net)}</div>

          <div style="margin-top:8px;display:flex;align-items:center;gap:6px">
            <div style="font-size:10px;font-weight:700;color:${srColor};background:${srColor}18;padding:2px 7px;border-radius:99px;border:1px solid ${srColor}33">%${sr} tasarruf</div>
          </div>
          ${changeHtml}
        </div>`;
    });

    return `
      <div style="margin-bottom:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <h3 style="font-size:15px;font-weight:700;color:var(--text-main);display:flex;align-items:center;gap:8px">
            <svg style="width:16px;height:16px;fill:none;stroke:var(--brand-accent);stroke-width:2;stroke-linecap:round;stroke-linejoin:round" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Aylik Karsilastirma
          </h3>
          <span style="font-size:11px;color:var(--text-muted);font-weight:600">${months.length} ay</span>
        </div>
        <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:4px;scrollbar-width:thin">
          ${cards.join('')}
        </div>
      </div>`;
  }

  function _buildSavingsBreakdown(ctx) {
    const { savingsRate, totalInc, totalExp, net, fmt } = ctx;
    const score = Math.min(100, Math.max(0, savingsRate + 50));

    const criteria = [
      {
        label: 'Tasarruf Orani',
        desc: 'Net birikim ÷ Toplam gelir',
        detail: `${fmt(net)} ÷ ${fmt(totalInc)} = <strong>%${Math.max(0, savingsRate).toFixed(0)}</strong>`,
        weight: 60,
        score: Math.min(60, Math.max(0, savingsRate * 1.2)),
        tip: savingsRate < 20 ? 'Hedef: gelirin en az %20\'si' : null
      },
      {
        label: 'Gelir-Gider Dengesi',
        desc: 'Gider / Gelir orani',
        detail: totalInc > 0 ? `${fmt(totalExp)} ÷ ${fmt(totalInc)} = <strong>%${((totalExp / totalInc) * 100).toFixed(0)}</strong>` : 'Veri yok',
        weight: 40,
        score: totalInc > 0 ? Math.min(40, Math.max(0, (1 - totalExp / totalInc) * 80)) : 0,
        tip: totalInc > 0 && (totalExp / totalInc) > 0.9 ? 'Gider/gelir orani yuksek' : null
      }
    ];

    const bands = [
      { min: 80, label: 'Mukemmel', color: 'var(--status-success)', desc: 'Gelirinizin buyuk bolumunu biriktiriyorsunuz.' },
      { min: 60, label: 'Iyi',       color: 'var(--brand-accent)',   desc: 'Tasarruf aliskanliginiz guclu.' },
      { min: 40, label: 'Orta',      color: 'var(--status-warn)',    desc: 'Potansiyeliniz var, biraz daha kisabilirsiniz.' },
      { min: 20, label: 'Dikkat',    color: 'var(--status-warn)',    desc: 'Giderler gelirinizi zorluyor.' },
      { min: 0,  label: 'Kritik',    color: 'var(--status-danger)',  desc: 'Butcenizde ciddi bir acik var.' }
    ];
    const band = bands.find(b => score >= b.min) || bands[bands.length - 1];

    const rows = criteria.map(c => {
      const pct = Math.min(100, (c.score / c.weight) * 100);
      const barColor = pct >= 70 ? 'var(--status-success)' : pct >= 40 ? 'var(--status-warn)' : 'var(--status-danger)';
      return `
        <div style="margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px">
            <div>
              <span style="font-size:13px;font-weight:700;color:var(--text-main)">${c.label}</span>
              <span style="font-size:11px;color:var(--text-muted);margin-left:6px">${c.desc}</span>
            </div>
            <span style="font-size:12px;font-weight:700;color:var(--text-secondary)">${c.weight} pt uzerinden</span>
          </div>
          <div style="height:6px;background:var(--bg-body);border-radius:99px;overflow:hidden;margin-bottom:4px;border:1px solid var(--border-light)">
            <div style="height:100%;width:${pct}%;background:${barColor};border-radius:99px;transition:width .7s cubic-bezier(.16,1,.3,1)"></div>
          </div>
          <div style="font-size:11px;color:var(--text-muted)">${c.detail}${c.tip ? ` · <span style="color:var(--status-warn);font-weight:600">${c.tip}</span>` : ''}</div>
        </div>`;
    }).join('');

    return `
      <div style="margin-top:16px;padding:14px;background:var(--bg-body);border-radius:var(--radius-md);border:1px solid var(--border-light)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <span style="font-size:13px;font-weight:700;color:var(--text-secondary)">Skor Nasil Hesaplaniyor?</span>
          <span style="font-size:11px;font-weight:800;padding:3px 10px;border-radius:99px;background:${band.color}18;color:${band.color};border:1px solid ${band.color}33">${band.label}</span>
        </div>
        ${rows}
        <div style="padding:10px 12px;background:var(--bg-surface);border-radius:var(--radius-sm);border:1px solid var(--border-light);font-size:12px;color:var(--text-muted);margin-top:4px">
          <strong style="color:var(--text-main)">Skor = </strong> Tasarruf orani (%60 agirlik) + Gelir-gider dengesi (%40 agirlik). 
          100 puan uzerinden hesaplanir; mevcut skor: <strong style="color:${band.color}">${Math.round(score)}</strong>.
        </div>
      </div>`;
  }

  function _buildTips(ctx) {
    const { savingsRate, totalExp, totalInc, allTx, recurring, budgets, fmt, months } = ctx;
    const expTx = allTx.filter(t => t.type === 'expense');
    const catTotals = {};
    expTx.forEach(t => { catTotals[t.cat] = (catTotals[t.cat] || 0) + _toMain(t); });
    const topCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);

    const pool = [];

    if (savingsRate < 20) {
      pool.push({ text: '50/30/20 kurali: gelirinizin %50\'si ihtiyaclar, %30\'u istekler, %20\'si tasarruf. Baslamak icin kucuk adimlar atin.' });
    }

    if (topCats.length && totalExp > 0 && (topCats[0][1] / totalExp) > 0.35) {
      pool.push({ text: `<strong>${topCats[0][0]}</strong> harcamalarinizi %10 kismak aylik ${fmt(topCats[0][1] * 0.1)} tasarruf saglar.` });
    }

    if (recurring && recurring.length >= 4) {
      pool.push({ text: `${recurring.length} aktif aboneligi gozden gecirerek kullanmadiklarinizi iptal etmek otomatik tasarruf demek.` });
    }

    if (!budgets || budgets.length === 0) {
      pool.push({ text: 'En yuksek 2-3 harcama kategoriniz icin butce limiti belirlemek harcama aliskanliklarini sekillendirmenin en etkili yoludur.' });
    }

    if (months.length >= 3) {
      const last3 = months.slice(-3);
      if (last3[2].exp < last3[0].exp) {
        pool.push({ text: 'Giderleriniz son aylarda dusuyor — bu iyi bir momentum. Tasarruflarinizi bir yatirim aracina yonlendirmeyi dusunebilirsiniz.' });
      }
    }

    if (totalInc > 0 && totalInc < 10000 && savingsRate < 15) {
      pool.push({ text: 'Gelir artisi, gider kisintisindan daha hizli sonuc verebilir. Yan gelir kaynaklari arastirmak uzun vadede tasarruf oranini katlayabilir.' });
    }

    if (savingsRate < 10) {
      pool.push({ text: '3-6 aylik giderinizi karsilayacak bir acil fon olusturmak finansal guvenlik aginizi saglamlastirir. Kucuk ama duzenli transferler buyuk fark yaratir.' });
    }

    pool.push({ text: 'Finansal verilerinizi duzenli kaydetmek basli basina bir aliskanlik. Bu farkindalik zamanla harcama kararlarinizi iyilestirir.' });

    const selected = pool.slice(0, 3);
    if (!selected.length) return '';

    return `
      <div style="margin-top:14px">
        <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px">Kisisel Oneriler</div>
        ${selected.map(tip => `
          <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--border-light)">
            <span style="font-size:13px;color:var(--text-secondary);line-height:1.6">${tip.text}</span>
          </div>`).join('')}
      </div>`;
  }

  function _toMain(tx) {
    if (window.App && App.Money && App.Money.toMain) return App.Money.toMain(tx);
    return tx.amount || 0;
  }

  function _convertToMain(amount, fromCur, toCur) {
    if (window.App && App.ExchangeRate && App.ExchangeRate.convert) {
      return App.ExchangeRate.convert(amount, fromCur, toCur);
    }
    return amount;
  }

  function render(ctx) {
    const insightEl = document.getElementById('aiInsightText');
    const tagsEl = document.getElementById('aiInsightTags');
    if (insightEl) {
      const { text, tags } = _buildInsightText(ctx);
      insightEl.innerHTML = text;
      if (tagsEl) {
        tagsEl.innerHTML = tags.map(tag =>
          `<span class="ai-tag ${tag.cls}">${tag.label}</span>`
        ).join('');
      }
    }

    const tipsEl = document.getElementById('aiInsightTips');
    if (tipsEl) {
      tipsEl.innerHTML = _buildTips(ctx);
    }

    const monthlyEl = document.getElementById('sagiMonthlyCards');
    if (monthlyEl) {
      monthlyEl.innerHTML = _buildMonthlyCards(ctx);
    }

    const breakdownEl = document.getElementById('sagiSavingsBreakdown');
    if (breakdownEl) {
      breakdownEl.innerHTML = _buildSavingsBreakdown(ctx);
    }
  }

  return { render };

})();