/**
 * SAGI ASSISTANT - Finansal Yorum Motoru v2
 */

/* global Core, App */
'use strict';

window.SAGIAssistant = (function () {

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  const TEXTS = {
    tr: {
      noData: 'Henüz işlem kaydı bulunamadı. İşlem ekledikçe finansal tablonuz burada canlanacak.',
      tagSavingsLeader: 'Tasarruf Lideri',
      tagBalanced: 'Dengeli',
      tagWarn: 'Dikkat',
      tagDeficit: 'Açık Var',
      tagExpRising: 'Gider Artıyor',
      tagExpFalling: 'Gider Düşüyor',
      tagLessThisMonth: 'Bu Ay Daha Az',
      savingsHigh: (r,fmt,inc) => pick([
        `Finansal açıdan harika bir performans sergiliyorsunuz — gelirinizin <strong>%${r}'ini</strong> biriktiriyorsunuz. Bu oran pek çok finansal danışmanın önerdiği %20'nin iki katı.`,
        `Gelirinizin <strong>%${r}'ini</strong> birikim olarak kenara koyuyorsunuz — bu gerçekten etkileyici bir oran. Birkaç ayda bir bu birikimi bir hedef fonuna aktarmayı düşünebilirsiniz.`,
        `Tasarruf oranınız <strong>%${r}</strong> ile üst segment finansal planlama bandında. Bu tempoda yıllık net birikim potansiyeliniz ${fmt(inc*(r/100)*12)}'ye ulaşabilir.`
      ]),
      savingsGood: (r) => pick([
        `Gelirinizin <strong>%${r}'ini</strong> biriktiriyorsunuz — finansal uzmanların önerdiği %20 hedefini yakalamışsınız, tebrikler!`,
        `Dengeli bir finansal resim var: harcamalarınız kontrol altında ve <strong>%${r}</strong> tasarruf oranıyla iyi bir yoldasınız.`,
        `<strong>%${r}</strong> tasarruf oranı makul bir finansal sağlık göstergesi. Küçük ayarlamalarla bu oranı daha da yukarı taşıyabilirsiniz.`
      ]),
      savingsLow: (r,fmt,inc) => pick([
        `Gelirinizin yalnızca <strong>%${r}'i</strong> birikim olarak kalıyor. Giderlerinizi biraz daha kısmak büyük fark yaratabilir — küçük adımlar büyük kazanımlara dönüşür.`,
        `Birikim oranınız <strong>%${r}</strong> düzeyinde. 50/30/20 kuralını uygulamak — gelirin %50'si ihtiyaçlar, %30'u istekler, %20'si tasarruf — finansal dengenizi güçlendirebilir.`,
        `Gelir-gider makasını açmak için en kolay yol sabit giderleri sorgulamak. Şu an <strong>%${r}</strong> biriktiriyorsunuz; bu oranı %15'e çıkarmak aylık ${fmt((inc*0.15)-(inc*r/100))} ek birikim demek.`
      ]),
      savingsMin: () => pick([
        `Gelirinizin neredeyse tamamı giderlere gidiyor. En büyük 3 harcama kategorinizi gözden geçirmenizi öneririm.`,
        `Finansal tamponunuz çok ince — beklenmedik bir gider dengeyi bozabilir. Küçük de olsa bir acil fon oluşturmak öncelikli hedefiniz olabilir.`
      ]),
      savingsNeg: (fmt,net) => pick([
        `Giderleriniz gelirinizi <strong>${fmt(Math.abs(net))}</strong> aşıyor. Bu durum sürdürülürse borç sarmalına girebilir — önce hangi harcamaları kısabileceğinize bakmanızı öneririm.`,
        `Bütçenizde <strong>${fmt(Math.abs(net))}</strong> açık var. Sabit giderler (kira, abonelikler) ve değişken giderleri ayıştırmak bu açığı kapatmanın ilk adımı olabilir.`
      ]),
      topCatHigh: (cat,pct) => pick([
        `<strong>${cat}</strong> harcamalarınız toplam giderinizin <strong>%${pct}'ini</strong> oluşturuyor — bu yüksek konsantrasyon dikkat gerektiriyor.`,
        `Giderlerinizin neredeyse yarısı tek kategoride: <strong>${cat}</strong>. Bu kategoriyi optimize etmek finansal tablonuzu hızla iyileştirebilir.`
      ]),
      topCatTwo: (c1,p1,c2,p2,fmt,amt) => pick([
        `En büyük iki harcama kategoriniz <strong>${c1}</strong> (%${p1}) ve <strong>${c2}</strong> (%${p2}).`,
        `Gider dağılımınıza bakıldığında <strong>${c1}</strong> öne çıkıyor. Bu kategoriyi %10 azaltmak aylık ${fmt(amt)} tasarruf demek.`
      ]),
      expRising: (pct) => `Son 3 ayda giderlerinizde <strong>%${pct} artış</strong> eğilimi var — bu momentumun devam etmesi durumunda bütçenizi revize etmeniz gerekebilir.`,
      expFalling: (pct) => `Son 3 ayda giderlerinizi <strong>%${pct} azaltmayı</strong> başardınız — bu olumlu bir kırılma noktası!`,
      moreThisMonth: (pct,fmt,diff) => `Bu ay geçen aya kıyasla <strong>%${pct} daha fazla</strong> harcama yaptınız (${fmt(Math.abs(diff))} fark).`,
      lessThisMonth: (pct,fmt,diff) => `Bu ay geçen aya kıyasla <strong>%${Math.abs(pct)} daha az</strong> harcadınız — ${fmt(Math.abs(diff))} tasarruf ettiniz!`,
      recurringHigh: (n,pct) => `Sabit giderleriniz (${n} abonelik) toplam harcamanızın <strong>%${pct}'ini</strong> oluşturuyor — kullanmadığınız abonelikleri gözden geçirin.`,
      thisMonth: 'BU AY',
      income: 'Gelir',
      expense: 'Gider',
      net: 'Net',
      savingRate: (r) => `%${r} tasarruf`,
      expChange: (arrow,pct) => `${arrow} Gider %${pct}`,
      monthlyComparison: 'Aylık Karşılaştırma',
      months: (n) => `${n} ay`,
      scoreTitle: 'Skor Nasıl Hesaplanıyor?',
      scoreFormula: (score,color) => `<strong style="color:var(--text-main)">Skor = </strong> Tasarruf oranı (%60 ağırlık) + Gelir-gider dengesi (%40 ağırlık). 100 puan üzerinden hesaplanır; mevcut skor: <strong style="color:${color}">${Math.round(score)}</strong>.`,
      scoreOver: (w) => `${w} pt üzerinden`,
      scoreSavingsLabel: 'Tasarruf Oranı',
      scoreSavingsDesc: 'Net birikim ÷ Toplam gelir',
      scoreBalanceLabel: 'Gelir-Gider Dengesi',
      scoreBalanceDesc: 'Gider / Gelir oranı',
      scoreBalanceNoData: 'Veri yok',
      scoreTipSavings: 'Hedef: gelirin en az %20\'si',
      scoreTipBalance: 'Gider/gelir oranı yüksek',
      bandExcellent: 'Mükemmel', bandExcellentDesc: 'Gelirinizin büyük bölümünü biriktiriyorsunuz.',
      bandGood: 'İyi',           bandGoodDesc: 'Tasarruf alışkanlığınız güçlü.',
      bandMid: 'Orta',           bandMidDesc: 'Potansiyeliniz var, biraz daha kısabilirsiniz.',
      bandWarn: 'Dikkat',        bandWarnDesc: 'Giderler gelirinizi zorluyor.',
      bandCrit: 'Kritik',        bandCritDesc: 'Bütçenizde ciddi bir açık var.',
      tipsTitle: 'Kişisel Öneriler',
      tip5030: '50/30/20 kuralı: gelirinizin %50\'si ihtiyaçlar, %30\'u istekler, %20\'si tasarruf. Başlamak için küçük adımlar atın.',
      tipTopCat: (cat,fmt,amt) => `<strong>${cat}</strong> harcamalarınızı %10 kısmak aylık ${fmt(amt)} tasarruf sağlar.`,
      tipRecurring: (n) => `${n} aktif aboneliği gözden geçirerek kullanmadıklarınızı iptal etmek otomatik tasarruf demek.`,
      tipBudget: 'En yüksek 2-3 harcama kategoriniz için bütçe limiti belirlemek harcama alışkanlıklarını şekillendirmenin en etkili yoludur.',
      tipMomentum: 'Giderleriniz son aylarda düşüyor — bu iyi bir momentum. Tasarruflarınızı bir yatırım aracına yönlendirmeyi düşünebilirsiniz.',
      tipIncome: 'Gelir artışı, gider kısıntısından daha hızlı sonuç verebilir. Yan gelir kaynakları araştırmak uzun vadede tasarruf oranını katlayabilir.',
      tipEmergency: '3-6 aylık giderinizi karşılayacak bir acil fon oluşturmak finansal güvenlik ağınızı sağlamlaştırır. Küçük ama düzenli transferler büyük fark yaratır.',
      tipHabit: 'Finansal verilerinizi düzenli kaydetmek başlı başına bir alışkanlık. Bu farkındalık zamanla harcama kararlarınızı iyileştirir.',
    },
    en: {
      noData: 'No transactions found yet. Your financial picture will appear here as you add records.',
      tagSavingsLeader: 'Savings Leader',
      tagBalanced: 'Balanced',
      tagWarn: 'Caution',
      tagDeficit: 'Deficit',
      tagExpRising: 'Spending Up',
      tagExpFalling: 'Spending Down',
      tagLessThisMonth: 'Less This Month',
      savingsHigh: (r,fmt,inc) => pick([
        `You're saving <strong>${r}%</strong> of your income — an impressive rate that's twice the 20% recommended by most financial advisors.`,
        `You're setting aside <strong>${r}%</strong> of your income — truly impressive. Consider moving this to a dedicated goal fund every few months.`,
        `Your savings rate of <strong>${r}%</strong> places you in the top financial planning tier. At this pace your annual savings potential could reach ${fmt(inc*(r/100)*12)}.`
      ]),
      savingsGood: (r) => pick([
        `You're saving <strong>${r}%</strong> of your income — you've hit the 20% target recommended by financial experts. Well done!`,
        `A balanced financial picture: spending is under control and a <strong>${r}%</strong> savings rate puts you on solid ground.`,
        `A <strong>${r}%</strong> savings rate is a healthy financial indicator. Small tweaks could push it even higher.`
      ]),
      savingsLow: (r,fmt,inc) => pick([
        `Only <strong>${r}%</strong> of your income is left as savings. Cutting costs slightly could make a big difference — small steps lead to big gains.`,
        `Your savings rate is <strong>${r}%</strong>. Applying the 50/30/20 rule — 50% needs, 30% wants, 20% savings — could strengthen your financial balance.`,
        `The easiest way to widen your income-expense gap is to question fixed costs. You're currently saving <strong>${r}%</strong>; raising it to 15% means ${fmt((inc*0.15)-(inc*r/100))} extra savings per month.`
      ]),
      savingsMin: () => pick([
        `Almost all of your income is going to expenses. I'd recommend reviewing your top 3 spending categories.`,
        `Your financial buffer is very thin — an unexpected expense could throw things off. Building even a small emergency fund could be your top priority.`
      ]),
      savingsNeg: (fmt,net) => pick([
        `Your expenses exceed your income by <strong>${fmt(Math.abs(net))}</strong>. If this continues you risk falling into a debt spiral — start by identifying what you can cut.`,
        `There's a <strong>${fmt(Math.abs(net))}</strong> gap in your budget. Separating fixed costs (rent, subscriptions) from variable ones is the first step to closing it.`
      ]),
      topCatHigh: (cat,pct) => pick([
        `<strong>${cat}</strong> makes up <strong>${pct}%</strong> of your total expenses — this high concentration deserves attention.`,
        `Nearly half of your spending is in one category: <strong>${cat}</strong>. Optimising this could quickly improve your financial picture.`
      ]),
      topCatTwo: (c1,p1,c2,p2,fmt,amt) => pick([
        `Your two largest spending categories are <strong>${c1}</strong> (${p1}%) and <strong>${c2}</strong> (${p2}%).`,
        `Looking at your spending, <strong>${c1}</strong> stands out. Cutting it by 10% means ${fmt(amt)} saved per month.`
      ]),
      expRising: (pct) => `Your expenses have trended <strong>${pct}% higher</strong> over the last 3 months — if this continues you may need to revise your budget.`,
      expFalling: (pct) => `You've managed to cut expenses by <strong>${pct}%</strong> over the last 3 months — a great turning point!`,
      moreThisMonth: (pct,fmt,diff) => `You spent <strong>${pct}% more</strong> this month compared to last (${fmt(Math.abs(diff))} difference).`,
      lessThisMonth: (pct,fmt,diff) => `You spent <strong>${Math.abs(pct)}% less</strong> this month — saving ${fmt(Math.abs(diff))}!`,
      recurringHigh: (n,pct) => `Your fixed costs (${n} subscriptions) make up <strong>${pct}%</strong> of total spending — review any you're not using.`,
      thisMonth: 'THIS MONTH',
      income: 'Income',
      expense: 'Expense',
      net: 'Net',
      savingRate: (r) => `${r}% saved`,
      expChange: (arrow,pct) => `${arrow} Expense ${pct}%`,
      monthlyComparison: 'Monthly Comparison',
      months: (n) => `${n} months`,
      scoreTitle: 'How Is the Score Calculated?',
      scoreFormula: (score,color) => `<strong style="color:var(--text-main)">Score = </strong> Savings rate (60% weight) + Income-expense balance (40% weight). Calculated out of 100; current score: <strong style="color:${color}">${Math.round(score)}</strong>.`,
      scoreOver: (w) => `out of ${w} pts`,
      scoreSavingsLabel: 'Savings Rate',
      scoreSavingsDesc: 'Net savings ÷ Total income',
      scoreBalanceLabel: 'Income-Expense Balance',
      scoreBalanceDesc: 'Expense / Income ratio',
      scoreBalanceNoData: 'No data',
      scoreTipSavings: 'Target: at least 20% of income',
      scoreTipBalance: 'Expense/income ratio is high',
      bandExcellent: 'Excellent',  bandExcellentDesc: 'You\'re saving a large portion of your income.',
      bandGood: 'Good',            bandGoodDesc: 'Your saving habits are strong.',
      bandMid: 'Average',          bandMidDesc: 'You have potential — try cutting a bit more.',
      bandWarn: 'Caution',         bandWarnDesc: 'Expenses are straining your income.',
      bandCrit: 'Critical',        bandCritDesc: 'There is a serious gap in your budget.',
      tipsTitle: 'Personal Recommendations',
      tip5030: '50/30/20 rule: 50% of income for needs, 30% for wants, 20% for savings. Start with small steps.',
      tipTopCat: (cat,fmt,amt) => `Cutting <strong>${cat}</strong> spending by 10% saves ${fmt(amt)} per month.`,
      tipRecurring: (n) => `Reviewing your ${n} active subscriptions and cancelling unused ones is automatic savings.`,
      tipBudget: 'Setting budget limits for your top 2-3 spending categories is the most effective way to shape spending habits.',
      tipMomentum: 'Your expenses have been falling lately — great momentum. Consider directing savings into an investment vehicle.',
      tipIncome: 'Growing income can outpace expense cuts. Exploring side income sources can multiply your savings rate over time.',
      tipEmergency: 'Building an emergency fund covering 3-6 months of expenses strengthens your financial safety net. Small, regular transfers make a big difference.',
      tipHabit: 'Consistently recording your financial data is a habit in itself. This awareness gradually improves your spending decisions.',
    }
  };

  function _T() { return window.LANG === 'en' ? TEXTS.en : TEXTS.tr; }

  function _buildInsightText(ctx) {
    const { totalInc, totalExp, net, savingsRate, allTx, months, period, fmt,
            prevMonthInc, prevMonthExp, recurring } = ctx;
    const L = _T();
    const messages = [];
    const tags = [];

    if (!allTx.length) {
      return { text: L.noData, tags: [] };
    }

    if (savingsRate >= 40) {
      messages.push(L.savingsHigh(savingsRate.toFixed(0), fmt, totalInc));
      tags.push({ label: L.tagSavingsLeader, cls: 'success' });
    } else if (savingsRate >= 20) {
      messages.push(L.savingsGood(savingsRate.toFixed(0)));
      tags.push({ label: L.tagBalanced, cls: 'success' });
    } else if (savingsRate >= 5) {
      messages.push(L.savingsLow(savingsRate.toFixed(0), fmt, totalInc));
      tags.push({ label: L.tagWarn, cls: 'warn' });
    } else if (savingsRate >= 0) {
      messages.push(L.savingsMin());
      tags.push({ label: L.tagWarn, cls: 'warn' });
    } else {
      messages.push(L.savingsNeg(fmt, net));
      tags.push({ label: L.tagDeficit, cls: 'danger' });
    }

    const expTx = allTx.filter(t => t.type === 'expense');
    const catTotals = {};
    expTx.forEach(t => { catTotals[t.cat] = (catTotals[t.cat] || 0) + _toMain(t); });
    const topCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);

    if (topCats.length >= 1 && totalExp > 0) {
      const top = topCats[0];
      const topPct = ((top[1] / totalExp) * 100).toFixed(0);
      if (topPct > 45) {
        messages.push(L.topCatHigh(top[0], topPct));
      } else if (topCats.length >= 2) {
        const top2 = topCats[1];
        messages.push(L.topCatTwo(top[0], topPct, top2[0], ((top2[1]/totalExp)*100).toFixed(0), fmt, top[1]*0.1));
      }
    }

    if (months.length >= 3) {
      const last3 = months.slice(-3);
      const expTrend = last3[2].exp - last3[0].exp;
      const expPct = Math.abs(expTrend / (last3[0].exp || 1) * 100).toFixed(0);
      if (Math.abs(expTrend) > 0) {
        if (expTrend > 0) {
          messages.push(L.expRising(expPct));
          tags.push({ label: L.tagExpRising, cls: 'danger' });
        } else {
          messages.push(L.expFalling(expPct));
          tags.push({ label: L.tagExpFalling, cls: 'success' });
        }
      }
    }

    if (period === 1 && prevMonthExp > 0) {
      const diff = totalExp - prevMonthExp;
      const diffPct = ((diff / prevMonthExp) * 100).toFixed(0);
      if (Math.abs(diff) > prevMonthExp * 0.05) {
        if (diff > 0) {
          messages.push(L.moreThisMonth(diffPct, fmt, diff));
        } else {
          messages.push(L.lessThisMonth(diffPct, fmt, diff));
          tags.push({ label: L.tagLessThisMonth, cls: 'success' });
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
        messages.push(L.recurringHigh(recurring.length, recPct));
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
          ${isLast ? `<div style="position:absolute;top:8px;right:8px;font-size:9px;font-weight:800;background:var(--brand-accent);color:#fff;padding:2px 7px;border-radius:99px;letter-spacing:.04em">${_T().thisMonth}</div>` : ''}
          <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">${m.label}</div>

          <div style="font-size:11px;color:var(--text-muted);font-weight:600;margin-bottom:2px">${_T().income}</div>
          <div style="font-family:var(--font-display);font-size:14px;font-weight:800;color:var(--status-success);letter-spacing:-.02em;margin-bottom:8px">${fmt(m.inc)}</div>

          <div style="font-size:11px;color:var(--text-muted);font-weight:600;margin-bottom:2px">${_T().expense}</div>
          <div style="font-family:var(--font-display);font-size:14px;font-weight:800;color:var(--status-danger);letter-spacing:-.02em;margin-bottom:8px">${fmt(m.exp)}</div>

          <div style="height:1px;background:var(--border-light);margin-bottom:8px"></div>

          <div style="font-size:11px;color:var(--text-muted);font-weight:600;margin-bottom:2px">${_T().net}</div>
          <div style="font-family:var(--font-display);font-size:15px;font-weight:800;color:${netColor};letter-spacing:-.02em">${isPositive ? '+' : ''}${fmt(net)}</div>

          <div style="margin-top:8px;display:flex;align-items:center;gap:6px">
            <div style="font-size:10px;font-weight:700;color:${srColor};background:${srColor}18;padding:2px 7px;border-radius:99px;border:1px solid ${srColor}33">${_T().savingRate(sr)}</div>
          </div>
          ${changeHtml}
        </div>`;
    });

    return `
      <div style="margin-bottom:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <h3 style="font-size:15px;font-weight:700;color:var(--text-main);display:flex;align-items:center;gap:8px">
            <svg style="width:16px;height:16px;fill:none;stroke:var(--brand-accent);stroke-width:2;stroke-linecap:round;stroke-linejoin:round" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            ${_T().monthlyComparison}
          </h3>
          <span style="font-size:11px;color:var(--text-muted);font-weight:600">${_T().months(months.length)}</span>
        </div>
        <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:4px;scrollbar-width:thin">
          ${cards.join('')}
        </div>
      </div>`;
  }

  function _buildSavingsBreakdown(ctx) {
    const { savingsRate, totalInc, totalExp, net, fmt } = ctx;
    const score = Math.min(100, Math.max(0, savingsRate + 50));

    const L = _T();
    const criteria = [
      {
        label: L.scoreSavingsLabel,
        desc: L.scoreSavingsDesc,
        detail: `${fmt(net)} ÷ ${fmt(totalInc)} = <strong>%${Math.max(0, savingsRate).toFixed(0)}</strong>`,
        weight: 60,
        score: Math.min(60, Math.max(0, savingsRate * 1.2)),
        tip: savingsRate < 20 ? L.scoreTipSavings : null
      },
      {
        label: L.scoreBalanceLabel,
        desc: L.scoreBalanceDesc,
        detail: totalInc > 0 ? `${fmt(totalExp)} ÷ ${fmt(totalInc)} = <strong>%${((totalExp / totalInc) * 100).toFixed(0)}</strong>` : L.scoreBalanceNoData,
        weight: 40,
        score: totalInc > 0 ? Math.min(40, Math.max(0, (1 - totalExp / totalInc) * 80)) : 0,
        tip: totalInc > 0 && (totalExp / totalInc) > 0.9 ? L.scoreTipBalance : null
      }
    ];

    const bands = [
      { min: 80, label: L.bandExcellent, color: 'var(--status-success)', desc: L.bandExcellentDesc },
      { min: 60, label: L.bandGood,      color: 'var(--brand-accent)',   desc: L.bandGoodDesc },
      { min: 40, label: L.bandMid,       color: 'var(--status-warn)',    desc: L.bandMidDesc },
      { min: 20, label: L.bandWarn,      color: 'var(--status-warn)',    desc: L.bandWarnDesc },
      { min: 0,  label: L.bandCrit,      color: 'var(--status-danger)',  desc: L.bandCritDesc }
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
            <span style="font-size:12px;font-weight:700;color:var(--text-secondary)">${L.scoreOver(c.weight)}</span>
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
          <span style="font-size:13px;font-weight:700;color:var(--text-secondary)">${L.scoreTitle}</span>
          <span style="font-size:11px;font-weight:800;padding:3px 10px;border-radius:99px;background:${band.color}18;color:${band.color};border:1px solid ${band.color}33">${band.label}</span>
        </div>
        ${rows}
        <div style="padding:10px 12px;background:var(--bg-surface);border-radius:var(--radius-sm);border:1px solid var(--border-light);font-size:12px;color:var(--text-muted);margin-top:4px">
          ${L.scoreFormula(score, band.color)}
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

    const L = _T();

    if (savingsRate < 20) {
      pool.push({ text: L.tip5030 });
    }

    if (topCats.length && totalExp > 0 && (topCats[0][1] / totalExp) > 0.35) {
      pool.push({ text: L.tipTopCat(topCats[0][0], fmt, topCats[0][1] * 0.1) });
    }

    if (recurring && recurring.length >= 4) {
      pool.push({ text: L.tipRecurring(recurring.length) });
    }

    if (!budgets || budgets.length === 0) {
      pool.push({ text: L.tipBudget });
    }

    if (months.length >= 3) {
      const last3 = months.slice(-3);
      if (last3[2].exp < last3[0].exp) {
        pool.push({ text: L.tipMomentum });
      }
    }

    if (totalInc > 0 && totalInc < 10000 && savingsRate < 15) {
      pool.push({ text: L.tipIncome });
    }

    if (savingsRate < 10) {
      pool.push({ text: L.tipEmergency });
    }

    pool.push({ text: L.tipHabit });

    const selected = pool.slice(0, 3);
    if (!selected.length) return '';

    return `
      <div style="margin-top:14px">
        <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px">${_T().tipsTitle}</div>
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