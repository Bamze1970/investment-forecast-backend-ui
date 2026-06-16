# Investment Forecast Web App - Backend Connected (v6)

Тази версия е frontend, който чете данни от backend API, вместо от локални изчисления.

## Какво прави
- Чете health от `/health`
- Чете dashboard от `/api/portfolios/{portfolio_id}/dashboard`
- Чете holdings от `/api/portfolios/{portfolio_id}/holdings`
- Чете forecasts от `/api/portfolios/{portfolio_id}/forecasts`

## Важно
- За текущия seed на backend-а използвай Portfolio ID: `portfolio-boris-main`
- Ако по-късно backend-ът започне да приема `external_portfolio_key`, можеш да смениш стойността към `boris-portfolio-01`

## Настройки
От бутона **Настройки** можеш да зададеш:
- Backend URL (например локален backend URL или deploy URL)
- Portfolio ID
